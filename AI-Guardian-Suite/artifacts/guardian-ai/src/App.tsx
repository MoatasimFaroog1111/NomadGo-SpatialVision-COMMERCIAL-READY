import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Dashboard from "@/pages/dashboard";
import Documents from "@/pages/documents";
import DocumentDetail from "@/pages/document-detail";
import Approvals from "@/pages/approvals";
import Transactions from "@/pages/transactions";
import AuditTrail from "@/pages/audit";
import Reports from "@/pages/reports";
import UploadDocument from "@/pages/upload";
import MemoryPage from "@/pages/memory";
import ChatPage from "@/pages/chat";
import SettingsPage from "@/pages/settings";
import AutonomousPage from "@/pages/autonomous";
import ChannelsPage from "@/pages/channels";
import PredictPage from "@/pages/predict";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/documents" component={Documents} />
        <Route path="/documents/:id" component={DocumentDetail} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/audit" component={AuditTrail} />
        <Route path="/reports" component={Reports} />
        <Route path="/upload" component={UploadDocument} />
        <Route path="/memory" component={MemoryPage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/autonomous" component={AutonomousPage} />
        <Route path="/channels" component={ChannelsPage} />
        <Route path="/predict" component={PredictPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
