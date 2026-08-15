export function buildInstoreSmsMessage(args: {
  invoiceNumber: string;
  customerName: string | null;
  url: string;
}): string {
  const greeting = args.customerName ? `Hello ${args.customerName}` : "Hello";
  return `${greeting}, invoice ${args.invoiceNumber} ready: ${args.url}`;
}
