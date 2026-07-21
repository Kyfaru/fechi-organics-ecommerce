export type PaystackInitResponse = {
  status: boolean;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

export type PaystackVerifyResponse = {
  status: boolean;
  data: {
    status: "success" | "failed" | "abandoned";
    reference: string;
    amount: number;
    gateway_response: string;
    paid_at: string;
    subaccount: { subaccount_code: string };
  };
};

export type InitTxInput = {
  email: string;
  amount: number;
  reference: string;
  subaccount?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
};
