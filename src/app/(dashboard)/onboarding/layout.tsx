import { OnboardingMembershipEscape } from './onboarding-membership-escape';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OnboardingMembershipEscape />
      {children}
    </>
  );
}
