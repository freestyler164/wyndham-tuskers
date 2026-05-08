import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import CreateSurvey from './pages/CreateSurvey.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Survey from './pages/Survey.jsx';
import AdminSurveys from './pages/AdminSurveys.jsx';
import Gallery from './pages/Gallery.jsx';
import About from './pages/About.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/about" element={<About />} />
      <Route path="/create-survey" element={<CreateSurvey />} />
      <Route path="/admin/surveys/new" element={<CreateSurvey adminMode />} />
      <Route path="/admin/surveys/:id/edit" element={<CreateSurvey adminMode editMode />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/survey/:id" element={<Survey />} />
      <Route path="/admin/surveys" element={<AdminSurveys />} />
    </Routes>
  );
}

export default App;
