import { notFound } from 'next/navigation';
import { DevTaskChatRailSandbox } from './sandbox-client';

export default function DevTaskChatRailSandboxPage() {
  if (process.env.NEXT_PUBLIC_DEV_SANDBOXES !== '1') {
    notFound();
  }
  return <DevTaskChatRailSandbox />;
}
