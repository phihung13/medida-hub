import { AiCreditsComponent } from '@gitroom/frontend/components/third-parties/ai.credits.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Social Hub Integrations' : 'Gitroom Integrations'
  }`,
  description: '',
};
export default async function Index() {
  return <AiCreditsComponent />;
}
