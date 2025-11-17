import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import idl from './voting_dapp.json';
import './VotingApp.css';

const PROGRAM_ID = new PublicKey('GmVVTa2jWgisJZAwbXHEVttEYxYcHDcLHBBxnD1mUmTq');

interface Poll {
    creator: PublicKey;
    pollId: BN;
    question: string;
    candidates: string[];
    voteCounts: BN[];
    totalVoters: BN;
    isActive: boolean;
    createdAt: BN;
    maxPlusVotes: number;
    allowMinusVote: boolean;
}

const VotingApp = () => {
    const { connection } = useConnection();
    const wallet = useWallet();

    const [polls, setPolls] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const [newPollQuestion, setNewPollQuestion] = useState('');
    const [newPollCandidates, setNewPollCandidates] = useState(['', '', '']);
    const [allowMinusVote, setAllowMinusVote] = useState(true);

    const getProgram = () => {
        if (!wallet.publicKey) return null;
        const provider = new AnchorProvider(connection, wallet as any, {});
        return new Program(idl as any, provider);
    };

    const getPollCounterPda = (creator: PublicKey) => {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('poll_counter'), creator.toBuffer()],
            PROGRAM_ID
        );
    };

    const getPollPda = (creator: PublicKey, pollId: number) => {
        return PublicKey.findProgramAddressSync(
            [
                Buffer.from('poll'),
                creator.toBuffer(),
                new BN(pollId).toArrayLike(Buffer, 'le', 8),
            ],
            PROGRAM_ID
        );
    };

    const initializePollCounter = async () => {
        if (!wallet.publicKey) {
            setMessage('Please connect your wallet first');
            return;
        }

        try {
            setLoading(true);
            const program = getProgram();
            if (!program) return;

            const [pollCounterPda] = getPollCounterPda(wallet.publicKey);

            const tx = await program.methods
                .initializePollCounter()
                .accounts({
                    creator: wallet.publicKey,
                } as any)
                .rpc();

            setMessage('Poll counter initialized successfully');
            console.log('Transaction signature:', tx);
        } catch (error: any) {
            console.error('Error:', error);
            setMessage('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const createPoll = async () => {
        if (!wallet.publicKey) {
            setMessage('Please connect your wallet first');
            return;
        }

        const validCandidates = newPollCandidates.filter(c => c.trim() !== '');
        if (validCandidates.length < 3) {
            setMessage('Need at least 3 candidates');
            return;
        }

        if (!newPollQuestion.trim()) {
            setMessage('Please enter a question');
            return;
        }

        try {
            setLoading(true);
            const program = getProgram();
            if (!program) return;

            const [pollCounterPda] = getPollCounterPda(wallet.publicKey);

            let pollCount = 0;
            try {
                const pollCounterAccount = await (program.account as any).pollCounter.fetch(pollCounterPda);
                pollCount = pollCounterAccount.pollCount.toNumber();
            } catch (e) {
                setMessage('Initializing poll counter first...');
                await initializePollCounter();
                return;
            }

            const [pollPda] = getPollPda(wallet.publicKey, pollCount);

            const tx = await program.methods
                .createPoll(
                    newPollQuestion,
                    validCandidates,
                    2,
                    allowMinusVote
                )
                .accounts({
                    creator: wallet.publicKey,
                } as any)
                .rpc();

            setMessage('Poll created successfully');
            console.log('Transaction signature:', tx);

            setNewPollQuestion('');
            setNewPollCandidates(['', '', '']);

            setTimeout(() => fetchPolls(), 2000);
        } catch (error: any) {
            console.error('Error:', error);
            setMessage('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const castVote = async (pollPda: PublicKey, vote1: number, vote2: number | null, minusVote: number | null) => {
        if (!wallet.publicKey) {
            setMessage('Please connect your wallet first');
            return;
        }

        try {
            setLoading(true);
            const program = getProgram();
            if (!program) return;

            const tx = await program.methods
                .castVote(vote1, vote2, minusVote)
                .accounts({
                    poll: pollPda,
                    voter: wallet.publicKey,
                } as any)
                .rpc();

            setMessage('Vote cast successfully');
            console.log('Transaction signature:', tx);

            setTimeout(() => fetchPolls(), 2000);
        } catch (error: any) {
            console.error('Error:', error);
            setMessage('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const closePoll = async (pollPda: PublicKey) => {
        if (!wallet.publicKey) return;

        try {
            setLoading(true);
            const program = getProgram();
            if (!program) return;

            const tx = await program.methods
                .closePoll()
                .accounts({
                    poll: pollPda,
                    creator: wallet.publicKey,
                } as any)
                .rpc();

            setMessage('Poll closed successfully');
            setTimeout(() => fetchPolls(), 2000);
        } catch (error: any) {
            console.error('Error:', error);
            setMessage('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

   const fetchPolls = async () => {
    try {
        const program = getProgram();
        if (!program) return;

        console.log('Fetching all polls for the program...');
        const pollAccounts = await (program.account as any).poll.all();

        console.log('Found polls:', pollAccounts.length);
        setPolls(pollAccounts);
    } catch (error) {
        console.error('Error fetching polls:', error);
        setTimeout(() => {
            fetchPolls();
        }, 2000);
    }
};

    useEffect(() => {
        if (wallet.publicKey) {
            // Add a small delay to ensure connection is ready
            setTimeout(() => {
                fetchPolls();
            }, 1000);
        } else {
            setPolls([]);
        }
    }, [wallet.publicKey]);


    const addCandidateField = () => {
        if (newPollCandidates.length < 8) {
            setNewPollCandidates([...newPollCandidates, '']);
        }
    };

    const removeCandidateField = (index: number) => {
        if (newPollCandidates.length > 3) {
            const updated = newPollCandidates.filter((_, i) => i !== index);
            setNewPollCandidates(updated);
        }
    };

    const VotingInterface = ({ poll, pollPda }: { poll: Poll; pollPda: PublicKey }) => {
        const [vote1, setVote1] = useState<number>(0);
        const [vote2, setVote2] = useState<number | null>(null);
        const [minusVote, setMinusVote] = useState<number | null>(null);

        const maxVotes = Math.max(...poll.voteCounts.map(v => v.toNumber()), 1);

        return (
            <div className="poll-card">
                <div className="poll-header">
                    <h3 className="poll-question">{poll.question}</h3>
                    <span className={`poll-status ${poll.isActive ? 'active' : 'closed'}`}>
                        {poll.isActive ? 'Active' : 'Closed'}
                    </span>
                </div>

                <div className="poll-meta">
                    <span>Total Voters: {poll.totalVoters.toString()}</span>
                </div>

                <div className="results-section">
                    <h4 className="section-title">Results</h4>
                    {poll.candidates.map((candidate: string, idx: number) => {
                        const voteCount = poll.voteCounts[idx].toNumber();
                        const percentage = maxVotes > 0 ? (Math.abs(voteCount) / maxVotes) * 100 : 0;

                        return (
                            <div key={idx} className="result-item">
                                <div className="result-header">
                                    <span className="candidate-name">{candidate}</span>
                                    <span className={`vote-count ${voteCount < 0 ? 'negative' : ''}`}>
                                        {voteCount > 0 ? '+' : ''}{voteCount}
                                    </span>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className={`progress-fill ${voteCount < 0 ? 'negative' : ''}`}
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {poll.isActive && (
                    <div className="voting-section">
                        <h4 className="section-title">Cast Your Vote</h4>

                        <div className="vote-controls">
                            <div className="form-group">
                                <label>First Choice (Required)</label>
                                <select value={vote1} onChange={(e) => setVote1(Number(e.target.value))} className="select-input">
                                    {poll.candidates.map((c: string, i: number) => (
                                        <option key={i} value={i}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Second Choice (Optional)</label>
                                <select value={vote2 ?? ''} onChange={(e) => setVote2(e.target.value ? Number(e.target.value) : null)} className="select-input">
                                    <option value="">None</option>
                                    {poll.candidates.map((c: string, i: number) => (
                                        <option key={i} value={i}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            {poll.allowMinusVote && (
                                <div className="form-group">
                                    <label>Minus Vote (Optional)</label>
                                    <select value={minusVote ?? ''} onChange={(e) => setMinusVote(e.target.value ? Number(e.target.value) : null)} className="select-input">
                                        <option value="">None</option>
                                        {poll.candidates.map((c: string, i: number) => (
                                            <option key={i} value={i}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => castVote(pollPda, vote1, vote2, minusVote)}
                            disabled={loading}
                            className="btn btn-primary"
                        >
                            {loading ? 'Submitting...' : 'Submit Vote'}
                        </button>
                    </div>
                )}

                {poll.isActive && wallet.publicKey?.equals(poll.creator) && (
                    <button
                        onClick={() => closePoll(pollPda)}
                        disabled={loading}
                        className="btn btn-danger"
                    >
                        Close Poll
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-content">
                    <div className="title-section">
                        <h1 className="app-title">VoteChain</h1>
                        <p className="app-subtitle">Decentralized Democratic Voting on Solana</p>

                    </div>
                    <WalletMultiButton />
                </div>
            </header>

            <main className="main-content">
                {message && (
                    <div className="alert">
                        {message}
                    </div>
                )}

                {wallet.publicKey ? (
                    <>
                        <div className="card create-poll-card">
                            <h2 className="card-title">Create New Poll</h2>
                            <p className="card-subtitle">Set up a new D21 voting poll with multiple candidates</p>

                            <div className="form-section">
                                <div className="form-group">
                                    <label>Poll Question</label>
                                    <input
                                        type="text"
                                        placeholder="What would you like to ask?"
                                        value={newPollQuestion}
                                        onChange={(e) => setNewPollQuestion(e.target.value)}
                                        className="text-input"
                                    />
                                </div>

                                <div className="candidates-section">
                                    <label>Candidates (minimum 3)</label>
                                    {newPollCandidates.map((candidate, idx) => (
                                        <div key={idx} className="candidate-input-row">
                                            <span className="candidate-number">{idx + 1}.</span>
                                            <input
                                                type="text"
                                                placeholder={`Candidate ${idx + 1}`}
                                                value={candidate}
                                                onChange={(e) => {
                                                    const updated = [...newPollCandidates];
                                                    updated[idx] = e.target.value;
                                                    setNewPollCandidates(updated);
                                                }}
                                                className="text-input"
                                            />
                                            {idx >= 3 && (
                                                <button
                                                    onClick={() => removeCandidateField(idx)}
                                                    className="btn-icon"
                                                    type="button"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {newPollCandidates.length < 8 && (
                                        <button onClick={addCandidateField} className="btn btn-secondary">
                                            + Add Candidate
                                        </button>
                                    )}
                                </div>

                                <div className="checkbox-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={allowMinusVote}
                                            onChange={(e) => setAllowMinusVote(e.target.checked)}
                                        />
                                        <span>Allow minus votes (D21 method)</span>
                                    </label>
                                </div>

                                <button
                                    onClick={createPoll}
                                    disabled={loading}
                                    className="btn btn-primary btn-large"
                                >
                                    {loading ? 'Creating...' : '+ Create Poll'}
                                </button>
                            </div>
                        </div>

                        <div className="polls-section">
                            <h2 className="section-header">Your Polls</h2>
                            {polls.length === 0 ? (
                                <div className="empty-state">
                                    <p>No polls created yet</p>
                                    <p className="empty-state-sub">Create your first poll above to get started</p>
                                </div>
                            ) : (
                                polls.map((pollAccount) => (
                                    <VotingInterface
                                        key={pollAccount.publicKey.toString()}
                                        poll={pollAccount.account as Poll}
                                        pollPda={pollAccount.publicKey}
                                    />
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div className="welcome-section">
                        <h2>Welcome to D21 Voting Platform</h2>
                        <p>Connect your Solana wallet to create polls and vote</p>
                        <p className="welcome-description">
                            D21 voting allows you to express your preferences more accurately by voting
                            for your top two choices and optionally voting against one option.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default VotingApp;
