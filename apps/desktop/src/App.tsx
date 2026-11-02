import DesktopRoot from './shell/DesktopRoot.js';
import AuthGate from './components/AuthGate.js';

export default function App() {
  return (
    <AuthGate>
      <DesktopRoot />
    </AuthGate>
  );
}
