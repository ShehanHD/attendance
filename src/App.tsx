import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Attendance from '@/pages/Attendance'
import Summary from '@/pages/Summary'
import Employees from "@/pages/Employees.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/attendance' element={<Attendance />} />
        <Route path='/summary' element={<Summary />} />
        <Route path='/employees' element={<Employees />} />
      </Routes>
    </BrowserRouter>
  )
}
