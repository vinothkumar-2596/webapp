import { StoreProvider, useStore } from './store';
import { Shell } from './Shell';
import { OverviewScreen } from '../screens/OverviewScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { BatchScreen } from '../screens/BatchScreen';
import { TemplateScreen } from '../screens/TemplateScreen';

function Screens() {
  const { screen, ready } = useStore();

  // Avoid a flash of the empty state before IndexedDB hydration completes.
  if (!ready) return null;

  switch (screen) {
    case 'overview':
      return <OverviewScreen />;
    case 'import':
      return <ImportScreen />;
    case 'batches':
      return <BatchScreen />;
    case 'template':
      return <TemplateScreen />;
  }
}

export default function App() {
  return (
    <StoreProvider>
      <Shell>
        <Screens />
      </Shell>
    </StoreProvider>
  );
}
