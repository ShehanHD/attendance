import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Attendance from '@/pages/Attendance'
import Summary from '@/pages/Summary'
import Employees from '@/pages/Employees'
import ChangePassword from '@/pages/ChangePassword'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path='/login' element={<Login />} />
          <Route path='/' element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path='/attendance' element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
          <Route path='/summary' element={<ProtectedRoute><Summary /></ProtectedRoute>} />
          <Route path='/employees' element={<ProtectedRoute><Employees /></ProtectedRoute>} />
          <Route path='/change-password' element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
