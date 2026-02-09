import { MappingModal } from './components';
import { FileUpload } from './components';
import { useStore } from './store/useStore';
import { Dashboard } from './components';

import { useEffect } from 'react';

function App() {
  const { tasks, loadFromDB } = useStore();

  useEffect(() => {
    loadFromDB();
  }, [loadFromDB]);

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 text-foreground font-sans antialiased overflow-hidden flex flex-col">
      {/* Header - Minimal & Floating */}
      <header className="h-16 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-40 flex-none">
        <div className="container h-full mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-gradient-to-tr from-primary to-slate-800 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-white"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Gantt<span className="text-primary/80">Master</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium border border-border/50">v2.0 Pro</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <MappingModal />

        {tasks.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
            <div className="max-w-2xl w-full space-y-8 animate-in fade-in zoom-in-95 duration-700">
              <div className="text-center space-y-4">
                <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
                  Tu Cronograma,<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">Visualizado.</span>
                </h2>
                <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                  Arrastra tus archivos Gantt y obtén un dashboard interactivo en segundos. Sin configuraciones complejas.
                </p>
              </div>

              <div className="bg-card/50 backdrop-blur-sm p-2 rounded-2xl shadow-2xl border border-border/50 ring-1 ring-white/20">
                <FileUpload />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full animate-in fade-in duration-500">
            <Dashboard />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
