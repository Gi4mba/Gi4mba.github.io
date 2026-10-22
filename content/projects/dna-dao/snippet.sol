if (block.timestamp <= proposalRef.endTime) {
    return Status.Pending;
} else if (sumAllVotes(proposalRef) * 100 < quorum * totalShares) {
    return Status.QuorumNotReached;
} else if (proposalRef.forShares * approvingThreshold <= sumForAndAgainstVotes(proposalRef)) {
    return Status.Rejected;
} else {
    return Status.Approved;
}
