import { AnchorProvider, BN, Program, setProvider } from "@anchor-lang/core";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const idl = JSON.parse(
  readFileSync(join(__dirname, "../target/idl/trustlancer_escrow.json"), "utf8"),
);

describe("trustlancer_escrow", function () {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = new Program(idl, provider) as any;
  const client = (provider.wallet as any).payer as Keypair;
  const connection = provider.connection;
  const amount = 1_000_000n;

  before(function () {
    assert.ok(client, "Anchor's local test wallet must expose its payer keypair");
  });

  async function createFixture(milestones = [amount]) {
    const freelancer = Keypair.generate();
    const mint = await createMint(connection, client, client.publicKey, null, 6);
    const clientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      client,
      mint,
      client.publicKey,
    );
    const total = milestones.reduce((sum, value) => sum + value, 0n);
    await mintTo(connection, client, mint, clientTokenAccount.address, client, total);

    const id = new BN(Date.now() + Math.floor(Math.random() * 1_000_000));
    const [escrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), client.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrow.toBuffer()],
      program.programId,
    );

    await program.methods
      .createEscrow(
        id,
        new BN(total.toString()),
        milestones.map((value) => ({ amount: new BN(value.toString()) })),
      )
      .accounts({
        client: client.publicKey,
        freelancer: freelancer.publicKey,
        mint,
        escrow,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { clientTokenAccount, escrow, freelancer, id, mint, total, vault };
  }

  async function fund(fixture: Awaited<ReturnType<typeof createFixture>>) {
    await program.methods
      .fundEscrow()
      .accounts({
        client: client.publicKey,
        mint: fixture.mint,
        escrow: fixture.escrow,
        vault: fixture.vault,
        clientTokenAccount: fixture.clientTokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  it("rejects escrow plans whose milestone amounts do not match the total", async function () {
    const mint = await createMint(connection, client, client.publicKey, null, 6);
    const id = new BN(Date.now() + 1_000_001);
    const [escrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), client.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrow.toBuffer()],
      program.programId,
    );

    await assert.rejects(
      program.methods
        .createEscrow(id, new BN(10), [{ amount: new BN(9) }])
        .accounts({
          client: client.publicKey,
          freelancer: Keypair.generate().publicKey,
          mint,
          escrow,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      (error: any) => error?.error?.errorCode?.code === "MilestoneTotalMismatch",
    );
  });

  it("funds, enforces milestone order, and releases each approved payment", async function () {
    const first = 400_000n;
    const second = 600_000n;
    const fixture = await createFixture([first, second]);
    await fund(fixture);
    const freelancerTokenAccount = getAssociatedTokenAddressSync(
      fixture.mint,
      fixture.freelancer.publicKey,
    );
    const accounts = {
      escrow: fixture.escrow,
      client: client.publicKey,
      freelancer: fixture.freelancer.publicKey,
      mint: fixture.mint,
      vault: fixture.vault,
      freelancerTokenAccount,
      associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };

    await assert.rejects(
      program.methods
        .submitMilestone(1, Array.from({ length: 32 }, () => 7))
        .accounts({ escrow: fixture.escrow, freelancer: fixture.freelancer.publicKey })
        .signers([fixture.freelancer])
        .rpc(),
      (error: any) => error?.error?.errorCode?.code === "MilestonesMustBeSequential",
    );

    await program.methods
      .submitMilestone(0, Array.from({ length: 32 }, () => 7))
      .accounts({ escrow: fixture.escrow, freelancer: fixture.freelancer.publicKey })
      .signers([fixture.freelancer])
      .rpc();
    await program.methods.approveMilestone(0).accounts(accounts).rpc();
    assert.equal((await getAccount(connection, freelancerTokenAccount)).amount, first);

    await program.methods
      .submitMilestone(1, Array.from({ length: 32 }, () => 8))
      .accounts({ escrow: fixture.escrow, freelancer: fixture.freelancer.publicKey })
      .signers([fixture.freelancer])
      .rpc();
    await program.methods.approveMilestone(1).accounts(accounts).rpc();

    const state = await program.account.escrow.fetch(fixture.escrow);
    assert.equal(state.status.completed !== undefined, true);
    assert.equal(state.releasedAmount.toString(), fixture.total.toString());
    assert.equal((await getAccount(connection, freelancerTokenAccount)).amount, fixture.total);
  });

  it("requires both parties to sign a refund and returns only the remaining balance", async function () {
    const fixture = await createFixture([amount]);
    await fund(fixture);

    const refundAccounts = {
      escrow: fixture.escrow,
      client: client.publicKey,
      freelancer: fixture.freelancer.publicKey,
      mint: fixture.mint,
      vault: fixture.vault,
      clientTokenAccount: fixture.clientTokenAccount.address,
      associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };

    await assert.rejects(program.methods.mutuallyRefund().accounts(refundAccounts).rpc());
    await program.methods
      .mutuallyRefund()
      .accounts(refundAccounts)
      .signers([fixture.freelancer])
      .rpc();

    const state = await program.account.escrow.fetch(fixture.escrow);
    assert.equal(state.status.cancelled !== undefined, true);
    assert.equal((await getAccount(connection, fixture.clientTokenAccount.address)).amount, fixture.total);
  });
});
