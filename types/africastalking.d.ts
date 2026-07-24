declare module "africastalking" {
  interface SmsRecipient {
    number: string;
    status: string;
    statusCode: number;
    messageId: string;
    cost: string;
  }

  interface SmsResponse {
    SMSMessageData: {
      Message: string;
      Recipients: SmsRecipient[];
    };
  }

  interface SmsService {
    send(params: { to: string | string[]; message: string; from?: string }): Promise<SmsResponse>;
  }

  interface AfricasTalkingClient {
    SMS: SmsService;
  }

  export default function AfricasTalking(options: { apiKey: string; username: string }): AfricasTalkingClient;
}
