import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { AuditoriaPage } from "./pages/AuditoriaPage";
import { CajaPage } from "./pages/CajaPage";
import { ComprobantePage } from "./pages/ComprobantePage";
import { ConsultaDeudaPage } from "./pages/ConsultaDeudaPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { TransaccionesPage } from "./pages/TransaccionesPage";
import { UsuariosPage } from "./pages/UsuariosPage";

export default function App() {
  return (
    <AuthProvider>
      <NavBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/deuda"
          element={
            <ProtectedRoute>
              <ConsultaDeudaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transacciones"
          element={
            <ProtectedRoute>
              <TransaccionesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/caja"
          element={
            <ProtectedRoute>
              <CajaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute rolesPermitidos={["supervisor", "admin"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/usuarios"
          element={
            <ProtectedRoute rolesPermitidos={["admin"]}>
              <UsuariosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute rolesPermitidos={["admin"]}>
              <AuditoriaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/comprobante/:tipo/:id"
          element={
            <ProtectedRoute>
              <ComprobantePage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/transacciones" replace />} />
        <Route path="*" element={<Navigate to="/transacciones" replace />} />
      </Routes>
    </AuthProvider>
  );
}
