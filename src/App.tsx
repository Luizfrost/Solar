import React, { useState, useEffect } from 'react';
import './index.css';

// Componentes de ícones (você pode substituir por SVGs ou usar lucide-react)
const CalendarIcon = () => <span>📅</span>;
const UsersIcon = () => <span>👥</span>;
const MessageIcon = () => <span>💬</span>;
const BellIcon = () => <span>🔔</span>;
const LogOutIcon = () => <span>🚪</span>;

function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('escalas');

  useEffect(() => {
    // Verificar se já está logado
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        alert('Credenciais inválidas! Use admin/admin123');
      }
    } catch (error) {
      console.error('Erro no login:', error);
      alert('Erro ao fazer login. Tente novamente.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  // Tela de Login
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
            Igreja Betel
          </h1>
          <p className="text-center text-gray-600 mb-6">
            Sistema de Gestão
          </p>
          <button
            onClick={() => handleLogin('admin', 'admin123')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
          >
            Entrar como Admin (demo)
          </button>
          <p className="text-xs text-center text-gray-500 mt-4">
            Use admin/admin123 para teste
          </p>
        </div>
      </div>
    );
  }

  // Dashboard principal
  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-800">Igreja Betel</h2>
          <p className="text-sm text-gray-600 mt-1">Olá, {user.fullName || user.username}!</p>
        </div>
        
        <nav className="mt-6">
          {[
            { id: 'escalas', icon: <CalendarIcon />, label: 'Escalas' },
            { id: 'membros', icon: <UsersIcon />, label: 'Membros' },
            { id: 'chat', icon: <MessageIcon />, label: 'Chat' },
            { id: 'mural', icon: <BellIcon />, label: 'Mural' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-6 py-3 text-left transition ${
                activeTab === item.id 
                  ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' 
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-6 py-3 text-left text-red-600 hover:bg-red-50 transition mt-auto"
          >
            <span className="mr-3"><LogOutIcon /></span>
            Sair
          </button>
        </nav>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 p-8">
        {activeTab === 'escalas' && (
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Escalas de Serviço</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de escalas em desenvolvimento...</p>
            </div>
          </div>
        )}

        {activeTab === 'membros' && (
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Membros</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de membros em desenvolvimento...</p>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Chat</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de chat em desenvolvimento...</p>
            </div>
          </div>
        )}

        {activeTab === 'mural' && (
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Mural de Recados</h1>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-600">Módulo de mural em desenvolvimento...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;