use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

// Keep this address synchronized with Anchor.toml and the program keypair.
declare_id!("DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh");

const MAX_MILESTONES: usize = 8;

#[program]
pub mod trustlancer_escrow {
    use super::*;

    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        id: u64,
        total_amount: u64,
        specs: Vec<MilestoneSpec>,
    ) -> Result<()> {
        require!(total_amount > 0, EscrowError::InvalidAmount);
        require!(!specs.is_empty(), EscrowError::NoMilestones);
        require!(specs.len() <= MAX_MILESTONES, EscrowError::TooManyMilestones);
        require_keys_neq!(ctx.accounts.client.key(), ctx.accounts.freelancer.key(), EscrowError::SameParty);

        let mut sum = 0u64;
        for spec in &specs {
            require!(spec.amount > 0, EscrowError::InvalidAmount);
            sum = sum
                .checked_add(spec.amount)
                .ok_or(error!(EscrowError::ArithmeticOverflow))?;
        }
        require!(sum == total_amount, EscrowError::MilestoneTotalMismatch);

        let escrow = &mut ctx.accounts.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.freelancer = ctx.accounts.freelancer.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.id = id;
        escrow.total_amount = total_amount;
        escrow.released_amount = 0;
        escrow.status = EscrowStatus::Created;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;
        escrow.milestones = specs
            .into_iter()
            .map(|spec| Milestone {
                amount: spec.amount,
                status: MilestoneStatus::Pending,
                deliverable_hash: [0; 32],
            })
            .collect();

        emit!(EscrowCreated {
            escrow: escrow.key(),
            client: escrow.client,
            freelancer: escrow.freelancer,
            mint: escrow.mint,
            total_amount,
        });
        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Created, EscrowError::InvalidStatus);
        require_keys_eq!(ctx.accounts.mint.key(), escrow.mint, EscrowError::WrongMint);

        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.client_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.client.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
            escrow.total_amount,
            ctx.accounts.mint.decimals,
        )?;

        escrow.status = EscrowStatus::Active;
        emit!(EscrowFunded { escrow: escrow.key(), amount: escrow.total_amount });
        Ok(())
    }

    pub fn submit_milestone(
        ctx: Context<SubmitMilestone>,
        milestone_index: u8,
        deliverable_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowError::InvalidStatus);
        let index = milestone_index as usize;
        require!(index < escrow.milestones.len(), EscrowError::InvalidMilestone);
        require!(
            escrow.milestones[index].status == MilestoneStatus::Pending,
            EscrowError::InvalidMilestoneStatus
        );
        if index > 0 {
            require!(
                escrow.milestones[index - 1].status == MilestoneStatus::Paid,
                EscrowError::MilestonesMustBeSequential
            );
        }
        require!(deliverable_hash != [0; 32], EscrowError::InvalidDeliverableHash);

        escrow.milestones[index].status = MilestoneStatus::Submitted;
        escrow.milestones[index].deliverable_hash = deliverable_hash;
        emit!(MilestoneSubmitted { escrow: escrow.key(), milestone_index, deliverable_hash });
        Ok(())
    }

    pub fn approve_milestone(ctx: Context<ApproveMilestone>, milestone_index: u8) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowError::InvalidStatus);
        let index = milestone_index as usize;
        require!(index < escrow.milestones.len(), EscrowError::InvalidMilestone);
        require!(
            escrow.milestones[index].status == MilestoneStatus::Submitted,
            EscrowError::MilestoneNotSubmitted
        );

        let amount = escrow.milestones[index].amount;
        let id_bytes = escrow.id.to_le_bytes();
        let bump = [escrow.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow",
            escrow.client.as_ref(),
            id_bytes.as_ref(),
            &bump,
        ]];
        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.freelancer_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts)
                .with_signer(signer_seeds),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        escrow.milestones[index].status = MilestoneStatus::Paid;
        escrow.released_amount = escrow
            .released_amount
            .checked_add(amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        if escrow.milestones.iter().all(|milestone| milestone.status == MilestoneStatus::Paid) {
            escrow.status = EscrowStatus::Completed;
        }
        emit!(MilestoneReleased { escrow: escrow.key(), milestone_index, amount });
        Ok(())
    }

    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Active, EscrowError::InvalidStatus);
        let party = ctx.accounts.party.key();
        require!(
            party == escrow.client || party == escrow.freelancer,
            EscrowError::UnauthorizedParty
        );
        escrow.status = EscrowStatus::Disputed;
        emit!(DisputeRaised { escrow: escrow.key(), party });
        Ok(())
    }

    /// Returns only the unreleased balance. Both parties must consent.
    pub fn mutually_refund(ctx: Context<MutuallyRefund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Active || escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );
        let refund_amount = escrow
            .total_amount
            .checked_sub(escrow.released_amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(refund_amount > 0, EscrowError::NothingToRefund);

        let id_bytes = escrow.id.to_le_bytes();
        let bump = [escrow.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow",
            escrow.client.as_ref(),
            id_bytes.as_ref(),
            &bump,
        ]];
        let cpi_accounts = TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.client_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts)
                .with_signer(signer_seeds),
            refund_amount,
            ctx.accounts.mint.decimals,
        )?;

        escrow.status = EscrowStatus::Cancelled;
        emit!(EscrowRefunded { escrow: escrow.key(), amount: refund_amount });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneSpec {
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MilestoneStatus {
    Pending,
    Submitted,
    Paid,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Created,
    Active,
    Disputed,
    Completed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Milestone {
    pub amount: u64,
    pub status: MilestoneStatus,
    pub deliverable_hash: [u8; 32],
}

#[account]
pub struct Escrow {
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub mint: Pubkey,
    pub id: u64,
    pub total_amount: u64,
    pub released_amount: u64,
    pub status: EscrowStatus,
    pub bump: u8,
    pub vault_bump: u8,
    pub milestones: Vec<Milestone>,
}

impl Escrow {
    // discriminator + fixed fields + vector prefix + eight bounded milestone entries
    pub const SPACE: usize = 8 + (32 * 3) + (8 * 3) + 1 + 1 + 1 + 4 + MAX_MILESTONES * (8 + 1 + 32);
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: Stored as the intended recipient. The freelancer must sign submissions and claims.
    pub freelancer: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = client,
        space = Escrow::SPACE,
        seeds = [b"escrow", client.key().as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = client,
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.client.as_ref(), escrow.id.to_le_bytes().as_ref()],
        bump = escrow.bump,
        has_one = client,
        has_one = mint
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump = escrow.vault_bump,
        token::mint = mint,
        token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = client)]
    pub client_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SubmitMilestone<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.client.as_ref(), escrow.id.to_le_bytes().as_ref()],
        bump = escrow.bump,
        has_one = freelancer
    )]
    pub escrow: Account<'info, Escrow>,
    pub freelancer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ApproveMilestone<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.client.as_ref(), escrow.id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, address = escrow.client)]
    pub client: Signer<'info>,
    /// CHECK: Address is constrained to the freelancer stored in escrow.
    #[account(address = escrow.freelancer)]
    pub freelancer: UncheckedAccount<'info>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump = escrow.vault_bump,
        token::mint = mint,
        token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = client,
        associated_token::mint = mint,
        associated_token::authority = freelancer
    )]
    pub freelancer_token_account: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.client.as_ref(), escrow.id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub party: Signer<'info>,
}

#[derive(Accounts)]
pub struct MutuallyRefund<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.client.as_ref(), escrow.id.to_le_bytes().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, address = escrow.client)]
    pub client: Signer<'info>,
    #[account(mut, address = escrow.freelancer)]
    pub freelancer: Signer<'info>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump = escrow.vault_bump,
        token::mint = mint,
        token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = client,
        associated_token::mint = mint,
        associated_token::authority = client
    )]
    pub client_token_account: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
}

#[event]
pub struct EscrowFunded { pub escrow: Pubkey, pub amount: u64 }
#[event]
pub struct MilestoneSubmitted { pub escrow: Pubkey, pub milestone_index: u8, pub deliverable_hash: [u8; 32] }
#[event]
pub struct MilestoneReleased { pub escrow: Pubkey, pub milestone_index: u8, pub amount: u64 }
#[event]
pub struct DisputeRaised { pub escrow: Pubkey, pub party: Pubkey }
#[event]
pub struct EscrowRefunded { pub escrow: Pubkey, pub amount: u64 }

#[error_code]
pub enum EscrowError {
    #[msg("Escrow amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Add at least one milestone.")]
    NoMilestones,
    #[msg("An escrow can contain at most eight milestones.")]
    TooManyMilestones,
    #[msg("Milestone amounts must add up to the escrow total.")]
    MilestoneTotalMismatch,
    #[msg("The client and freelancer must be different wallets.")]
    SameParty,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("This action is not allowed in the escrow's current state.")]
    InvalidStatus,
    #[msg("The supplied token mint does not match the escrow.")]
    WrongMint,
    #[msg("Milestone index does not exist.")]
    InvalidMilestone,
    #[msg("Milestone is not in the required state.")]
    InvalidMilestoneStatus,
    #[msg("Milestones must be submitted and paid in order.")]
    MilestonesMustBeSequential,
    #[msg("Submit a nonzero hash of the deliverable.")]
    InvalidDeliverableHash,
    #[msg("Submit the milestone before the client approves it.")]
    MilestoneNotSubmitted,
    #[msg("Only the client or freelancer can raise a dispute.")]
    UnauthorizedParty,
    #[msg("There is no unreleased amount to refund.")]
    NothingToRefund,
}
