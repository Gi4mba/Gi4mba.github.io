  useEffect(() => {
    // Esegui solo quando la transazione diventa success e c'è txHash.
    // Usiamo handledTxRef per evitare side-effect ripetuti se `items`
    // o altri valori cambiano dopo lo svuotamento del carrello.
    if (result?.success && txHash && handledTxRef.current !== txHash) {
      handledTxRef.current = txHash;

      const orderSnapshot = JSON.stringify({
        items,
        totalETH,
        totalUSD,
        txHash,
        recipientAddress: GIANNI_WALLET_ADDRESS,
        timestamp: Date.now(),
      });

      sessionStorage.setItem("lastOrder", orderSnapshot);

      clearCart();
      navigate("/success");
    }
  }, [result?.success, txHash, clearCart, navigate, items, totalETH, totalUSD]);
