const WHATSAPP_NUMBER = "254768151505";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

// "floating" keeps the old fixed bottom-right bubble; anything else
// (including unset) puts the button in the navbar instead.
export const whatsappInNavbar = process.env.NEXT_PUBLIC_WHATSAPP_BUTTON_POSITION !== "floating";
