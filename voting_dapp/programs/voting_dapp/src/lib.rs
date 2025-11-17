use anchor_lang::prelude::*;

declare_id!("2ByW5nwZkGCMLTuDLnehnRNUFb99egL9JvmPYTq55bca");

#[program]
pub mod voting_dapp {
    use super::*;

    pub fn initialize_poll_counter(ctx: Context<InitializePollCounter>) -> Result<()> {
        let poll_counter = &mut ctx.accounts.poll_counter;
        poll_counter.creator = ctx.accounts.creator.key();
        poll_counter.poll_count = 0;
        msg!("Poll counter initialized for creator: {}", ctx.accounts.creator.key());
        Ok(())
    }

    pub fn create_poll(
        ctx: Context<CreatePoll>,
        question: String,
        candidates: Vec<String>,
        max_plus_votes: u8,
        allow_minus_vote: bool,
    ) -> Result<()> {
        require!(candidates.len() >= 3 && candidates.len() <= 8, VotingError::InvalidCandidateCount);
        require!(max_plus_votes >= 2 && max_plus_votes <= 3, VotingError::InvalidMaxVotes);
        require!(question.len() <= 200, VotingError::QuestionTooLong);

        for candidate in &candidates {
            require!(candidate.len() <= 50, VotingError::CandidateNameTooLong);
        }

        let poll = &mut ctx.accounts.poll;
        let poll_counter = &mut ctx.accounts.poll_counter;

        poll.creator = ctx.accounts.creator.key();
        poll.poll_id = poll_counter.poll_count;
        poll.question = question;
        poll.candidates = candidates.clone();
        poll.vote_counts = vec![0; candidates.len()];
        poll.total_voters = 0;
        poll.is_active = true;
        poll.created_at = Clock::get()?.unix_timestamp;
        poll.max_plus_votes = max_plus_votes;
        poll.allow_minus_vote = allow_minus_vote;

        poll_counter.poll_count += 1;

        msg!("Poll created: {}", poll.question);
        Ok(())
    }

    pub fn cast_vote(
        ctx: Context<CastVote>,
        vote_option_1: u8,
        vote_option_2: Option<u8>,
        minus_vote_index: Option<u8>,
    ) -> Result<()> {
        let poll = &mut ctx.accounts.poll;

        let mut plus_vote_indices = vec![vote_option_1];
        if let Some(opt2) = vote_option_2 {
            plus_vote_indices.push(opt2);
        }

        require!(poll.is_active, VotingError::PollClosed);
        require!(plus_vote_indices.len() as u8 <= poll.max_plus_votes, VotingError::TooManyPlusVotes);

        if let Some(opt2) = vote_option_2 {
            require!(vote_option_1 != opt2, VotingError::DuplicateVote);
        }

        for &index in &plus_vote_indices {
            require!((index as usize) < poll.candidates.len(), VotingError::InvalidCandidateIndex);
        }

        if let Some(minus_idx) = minus_vote_index {
            require!(poll.allow_minus_vote, VotingError::MinusVoteNotAllowed);
            require!(plus_vote_indices.len() >= 2, VotingError::MinusVoteRequiresTwoPlusVotes);
            require!((minus_idx as usize) < poll.candidates.len(), VotingError::InvalidCandidateIndex);
            require!(!plus_vote_indices.contains(&minus_idx), VotingError::CannotPlusAndMinusSameCandidate);
        }

        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.voter = ctx.accounts.voter.key();
        vote_record.poll = poll.key();
        vote_record.vote_option_1 = vote_option_1;
        vote_record.vote_option_2 = vote_option_2;
        vote_record.minus_vote = minus_vote_index;
        vote_record.voted_at = Clock::get()?.unix_timestamp;

        for &index in &plus_vote_indices {
            poll.vote_counts[index as usize] += 1;
        }

        if let Some(minus_idx) = minus_vote_index {
            poll.vote_counts[minus_idx as usize] -= 1;
        }

        poll.total_voters += 1;

        msg!("Vote cast successfully by: {}", ctx.accounts.voter.key());
        Ok(())
    }

    pub fn close_poll(ctx: Context<ClosePoll>) -> Result<()> {
        let poll = &mut ctx.accounts.poll;
        require!(poll.is_active, VotingError::PollAlreadyClosed);
        require!(poll.creator == ctx.accounts.creator.key(), VotingError::Unauthorized);

        poll.is_active = false;
        msg!("Poll closed: {}", poll.question);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePollCounter<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 8,
        seeds = [b"poll_counter", creator.key().as_ref()],
        bump
    )]
    pub poll_counter: Account<'info, PollCounter>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatePoll<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 8 + 204 + 4 + (54 * 8) + 4 + (8 * 8) + 8 + 1 + 8 + 1 + 1,
        seeds = [b"poll", creator.key().as_ref(), poll_counter.poll_count.to_le_bytes().as_ref()],
        bump
    )]
    pub poll: Account<'info, Poll>,

    #[account(
        mut,
        seeds = [b"poll_counter", creator.key().as_ref()],
        bump
    )]
    pub poll_counter: Account<'info, PollCounter>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub poll: Account<'info, Poll>,

    #[account(
        init,
        payer = voter,
        space = 8 + 32 + 32 + 1 + 2 + 2 + 8,
        seeds = [b"vote_record", poll.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    #[account(mut)]
    pub voter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePoll<'info> {
    #[account(mut)]
    pub poll: Account<'info, Poll>,

    pub creator: Signer<'info>,
}

#[account]
pub struct PollCounter {
    pub creator: Pubkey,
    pub poll_count: u64,
}

#[account]
pub struct Poll {
    pub creator: Pubkey,
    pub poll_id: u64,
    pub question: String,
    pub candidates: Vec<String>,
    pub vote_counts: Vec<i64>,
    pub total_voters: u64,
    pub is_active: bool,
    pub created_at: i64,
    pub max_plus_votes: u8,
    pub allow_minus_vote: bool,
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub poll: Pubkey,
    pub vote_option_1: u8,
    pub vote_option_2: Option<u8>,
    pub minus_vote: Option<u8>,
    pub voted_at: i64,
}

#[error_code]
pub enum VotingError {
    #[msg("Poll must have between 3 and 8 candidates")]
    InvalidCandidateCount,
    #[msg("Max plus votes must be between 2 and 3")]
    InvalidMaxVotes,
    #[msg("Question is too long (max 200 characters)")]
    QuestionTooLong,
    #[msg("Candidate name is too long (max 50 characters)")]
    CandidateNameTooLong,
    #[msg("Poll is closed")]
    PollClosed,
    #[msg("Too many plus votes")]
    TooManyPlusVotes,
    #[msg("Must cast at least one plus vote")]
    MustCastAtLeastOnePlusVote,
    #[msg("Cannot vote for the same candidate twice")]
    DuplicateVote,
    #[msg("Invalid candidate index")]
    InvalidCandidateIndex,
    #[msg("Minus vote is not allowed for this poll")]
    MinusVoteNotAllowed,
    #[msg("Minus vote requires at least two plus votes")]
    MinusVoteRequiresTwoPlusVotes,
    #[msg("Cannot cast plus and minus vote for same candidate")]
    CannotPlusAndMinusSameCandidate,
    #[msg("Poll is already closed")]
    PollAlreadyClosed,
    #[msg("Unauthorized: Only poll creator can close poll")]
    Unauthorized,
}
