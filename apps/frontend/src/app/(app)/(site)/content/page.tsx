export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { ContentComponent } from '@gitroom/frontend/components/content/content.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Social Hub' : 'Gitroom'} Content`,
  description: '',
};
export default async function Index() {
  return <ContentComponent />;
}
