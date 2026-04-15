import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TransitProvider } from "./contexts/TransitContext";
import Splash from "./pages/Splash";
import Home from "./pages/Home";
import TripPlanner from "./pages/TripPlanner";
import NearbyStops from "./pages/NearbyStops";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Splash} />
      <Route path="/explore" component={Home} />
      <Route path="/plan" component={TripPlanner} />
      <Route path="/nearby" component={NearbyStops} />
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
