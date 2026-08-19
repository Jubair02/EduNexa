import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { AppRoutes } from "@/routes/AppRoutes";

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
