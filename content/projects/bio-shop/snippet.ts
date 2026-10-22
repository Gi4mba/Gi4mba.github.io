const amountWei = parseEther(amountETH);

const data = await sendTransactionMutation.mutateAsync({
  to: GIANNI_WALLET_ADDRESS,
  value: amountWei,
});
