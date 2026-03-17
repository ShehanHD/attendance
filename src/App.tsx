import { BrowserRouter, Routes, Route } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<div>Home placeholder</div>} />
        <Route path='/attendance' element={<div>Attendance placeholder</div>} />
        <Route path='/summary' element={<div>Summary placeholder</div>} />
      </Routes>
    </BrowserRouter>
  )
}
