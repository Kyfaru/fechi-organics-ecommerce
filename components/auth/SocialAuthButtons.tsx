"use client";

interface SocialAuthButtonsProps {
  onGoogleClick: () => void;
  onFacebookClick: () => void;
  isLoading?: boolean;
}

/**
 * Google + Facebook outlined pill buttons.
 * Matches the Figma "or continue with" divider block.
 * SVG brand icons are inline so no external dependency is needed.
 */
export default function SocialAuthButtons({
  onGoogleClick,
  onFacebookClick,
  isLoading = false,
}: SocialAuthButtonsProps) {
  const buttonClass = [
    "flex items-center justify-center gap-2.5 w-full py-3 px-5",
    "rounded-full border border-[#c0cab8] bg-white",
    "text-sm font-medium text-[#1a1c1c]",
    "hover:bg-gray-50 hover:border-[#40493c] transition-colors duration-150",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" ");

  return (
    <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-3">
      {/* ----------------------------------------------------------------- */}
      {/* Google                                                            */}
      {/* ----------------------------------------------------------------- */}
      <button
        type="button"
        onClick={onGoogleClick}
        disabled={isLoading}
        className={buttonClass}
        aria-label="Continue with Google"
      >
        {/* Official Google "G" logo colours */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M17.64 9.2045c0-.638-.057-1.252-.164-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9086c1.7009-1.5668 2.6836-3.874 2.6836-6.615Z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9086-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3446 0-4.3282-1.5832-5.036-3.7105H.957v2.3318C2.4382 15.9832 5.4818 18 9 18Z"
            fill="#34A853"
          />
          <path
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.5945.1023-1.1727.282-1.71V4.9582H.957A8.9961 8.9961 0 0 0 0 9c0 1.4523.3477 2.8264.957 4.0418L3.964 10.71Z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.891 11.4259 0 9 0 5.4818 0 2.4382 2.0168.957 4.9582L3.964 7.29C4.6718 5.1627 6.6554 3.5795 9 3.5795Z"
            fill="#EA4335"
          />
        </svg>
        Google
      </button>

      {/* ----------------------------------------------------------------- */}
      {/* Facebook                                                          */}
      {/* ----------------------------------------------------------------- */}
      <button
        type="button"
        onClick={onFacebookClick}
        disabled={isLoading}
        className={buttonClass}
        aria-label="Continue with Facebook"
      >
        {/* Official Facebook "f" logo */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M24 12C24 5.3726 18.6274 0 12 0C5.3726 0 0 5.3726 0 12C0 17.9896 4.3882 22.954 10.125 23.8542V15.4688H7.0781V12H10.125V9.356C10.125 6.349 11.9166 4.6875 14.6576 4.6875C15.9701 4.6875 17.3438 4.9219 17.3438 4.9219V7.875H15.8306C14.34 7.875 13.875 8.8 13.875 9.75V12H17.2031L16.6711 15.4688H13.875V23.8542C19.6118 22.954 24 17.9896 24 12Z"
            fill="#1877F2"
          />
          <path
            d="M16.6711 15.4688L17.2031 12H13.875V9.75C13.875 8.8004 14.34 7.875 15.8306 7.875H17.3438V4.9219C17.3438 4.9219 15.9704 4.6875 14.6576 4.6875C11.9166 4.6875 10.125 6.349 10.125 9.356V12H7.0781V15.4688H10.125V23.8542C10.7453 23.9501 11.3722 24 12 24C12.6278 24 13.2547 23.9501 13.875 23.8542V15.4688H16.6711Z"
            fill="white"
          />
        </svg>
        Facebook
      </button>
    </div>
  );
}
