export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { BulkComponent } from '@gitroom/frontend/components/bulk/bulk.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Social Hub' : 'Gitroom'} Bulk Import`,
  description: '',
};
export default async function Index() {
  return <BulkComponent />;
}
