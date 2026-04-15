import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TransitProvider } from "./contexts/TransitContext";
import Home from "./pages/Home";
import TripPlanner from "./pages/TripPlanner";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/plan" component={TripPlanner} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <TransitProvider>
            <Toaster />
            <Router />
          </TransitProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
