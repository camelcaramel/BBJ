import './App.css';
import { useEffect } from 'react';
import { useAppStore } from './state/store';
import { InitialSetup } from './components/InitialSetup';
import { ExcelUploader } from './components/ExcelUploader';
import { GroupBuilder } from './components/GroupBuilder';
import { AssignmentBoard } from './components/AssignmentBoard/Board';
import { ThemeToggle } from './components/Controls/ThemeToggle';
import { loadTheme } from './utils/persist';
import { ClassAssignment } from './components/ClassAssignment';

function App() {
  const step = useAppStore(s => s.currentStep);
  const hydrate = useAppStore(s => s.hydrate);
  const setStep = useAppStore(s => s.setStep);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const t = loadTheme() ?? 'light';
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  return (
    <div className="container">
      <div className="cluster" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>반배정 도우미</h2>
        <ThemeToggle />
      </div>
      {step === 'setup' && <InitialSetup />}
      {step === 'upload' && <ExcelUploader />}
      {step === 'group' && <GroupBuilder />}
      {step === 'assign' && <AssignmentBoard />}
      {step === 'auto-assign' && <ClassAssignment />}
    </div>
  )
}

export default App
