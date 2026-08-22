import { StoreProvider, useStore } from './store';
import { Shell } from './Shell';
import { ImportScreen } from '../screens/ImportScreen';
import { BatchScreen } from '../screens/BatchScreen';

function Screens() {
  const { screen, ready } = useStore();

  // Avoid a flash of the empty state before IndexedDB hydration completes.
  if (!ready) return null;

  switch (screen) {
    case 'import':
      return <ImportScreen />;
    case 'batches':
      return <BatchScreen />;
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
