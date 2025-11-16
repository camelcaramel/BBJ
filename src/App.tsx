import './App.css';
import { useEffect } from 'react';
import { useAppStore } from './state/store';
import { InitialSetup } from './components/InitialSetup';
import { ExcelUploader } from './components/ExcelUploader';
import { GroupBuilder } from './components/GroupBuilder';
import { AssignmentBoard } from './components/AssignmentBoard/Board';

function App() {
  const step = useAppStore(s => s.currentStep);
  const hydrate = useAppStore(s => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div style={{ padding: 16 }}>
      {step === 'setup' && <InitialSetup />}
      {step === 'upload' && <ExcelUploader />}
      {step === 'group' && <GroupBuilder />}
      {step === 'assign' && <AssignmentBoard />}
    </div>
  )
}

export default App
