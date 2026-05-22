import { Transaction } from '@stellar/stellar-sdk';

const xdr = "AAAAAgAAAACnJV6GpphvA8Hu8MktdXcoYE1W375A+LXzrfy9y05d6wAAAGQAKIQkAAAAAgAAAAEAAAAAAAAAAAAAAABqD+p4AAAAAAAAAAEAAAAAAAAABgAAAAFQSFBDAAAAAFxzxY+JOmP9idsO/QsKr5o53yISe0+uVi0ZEoIUfsdjf/////////8AAAAAAAAAAA==";

try {
  const tx = new Transaction(xdr, "Test SDF Network ; September 2015");
  
  const decoded = {
    sourceAccount: tx.source,
    fee: tx.fee,
    sequenceNumber: tx.sequence,
    timeBounds: tx.timeBounds,
    operations: tx.operations.map(op => {
      if (op.type === "changeTrust") {
        return {
          type: op.type,
          asset: {
            code: op.line.code,
            issuer: op.line.issuer
          },
          limit: op.limit
        };
      }
      return op;
    })
  };
  
  console.log(JSON.stringify(decoded, null, 2));
} catch (error) {
  console.error("Error decoding XDR:", error);
}
