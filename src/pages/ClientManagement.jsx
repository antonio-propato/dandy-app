import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  increment
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { firestore, auth } from '../lib/firebase';
import './ClientManagement.css';

export default function ClientManagement() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('name');    // 'name' | 'current' | 'lifetime'
  const [sortDir, setSortDir] = useState('asc');     // 'asc' | 'desc'

  const [selectedClient, setSelectedClient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStampsModal, setShowStampsModal] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [notification, setNotification] = useState({ type: '', message: '' });
  const [editForm, setEditForm] = useState({});
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const checkSuperUser = async () => {
      if (!auth.currentUser) {
        navigate('/signin');
        return;
      }
      try {
        const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'superuser') {
          navigate('/profile');
          return;
        }
        setUserData(userDoc.data());
        loadClients();
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      }
    };
    checkSuperUser();
  }, [navigate]);

  const showNotificationMessage = (type, message) => {
    setNotification({ type, message });
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  const showDeleteConfirmation = (clientId, clientName) => {
    setClientToDelete({ id: clientId, name: clientName });
    setShowConfirmDelete(true);
  };

  const capitalizeName = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const loadClients = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(firestore, 'users'));
      const stampsSnap = await getDocs(collection(firestore, 'stamps'));
      const stampsMap = {};
      stampsSnap.docs.forEach(d => stampsMap[d.id] = d.data());

      const data = usersSnap.docs
        .filter(d => d.data().role !== 'superuser')
        .map(d => {
          const u = d.data();
          const s = stampsMap[d.id] || {};
          return {
            id: d.id,
            ...u,
            stamps: s.stamps || [],
            lifetimeStamps: s.lifetimeStamps || 0,
            rewardsEarned: s.rewardsEarned || 0
          };
        });
      setClients(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Combined filter + sort
  const sortedClients = useMemo(() => {
    return clients
      .filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
        || c.email.toLowerCase().includes(searchTerm.toLowerCase())
        || c.phone.includes(searchTerm)
      )
      .sort((a, b) => {
        let A, B;
        if (sortKey === 'current') {
          A = a.stamps.length; B = b.stamps.length;
        } else if (sortKey === 'lifetime') {
          A = a.lifetimeStamps; B = b.lifetimeStamps;
        } else {
          A = `${a.firstName} ${a.lastName}`.toLowerCase();
          B = `${b.firstName} ${b.lastName}`.toLowerCase();
        }
        if (A < B) return sortDir === 'asc' ? -1 : 1;
        if (A > B) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
  }, [clients, searchTerm, sortKey, sortDir]);

  // … (all your modal handlers: openEditModal, openStampsModal, updateClient, addStamp, removeStamp, deleteClient)
  // Omitted here for brevity—just carry over your existing implementations.

  if (loading) {
    return (
      <div className="global-loading-container">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento clienti...</p>
      </div>
    );
  }

  return (
    <div className="client-management-container">
      <div className="client-management-header">
        <h1>Gestione Clienti</h1>
      </div>

      {/* Search + Sort */}
      <div className="client-search-section">
        <input
          type="text"
          placeholder="Cerca per nome, email o telefono..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="client-search-input"
        />
      </div>

      <div className="sort-toolbar">
        <button
          className={sortKey==='name' ? 'active' : ''}
          onClick={() => setSortKey('name')}
        >Nome</button>
        <button
          className={sortKey==='current' ? 'active' : ''}
          onClick={() => setSortKey('current')}
        >Attuali</button>
        <button
          className={sortKey==='lifetime' ? 'active' : ''}
          onClick={() => setSortKey('lifetime')}
        >Totali</button>
        <button
          className="sort-dir-toggle"
          onClick={() => setSortDir(d => d==='asc' ? 'desc' : 'asc')}
        >{sortDir==='asc' ? '▲' : '▼'}</button>
      </div>

      {/* Clients List */}
      <div className="clients-list">
        {sortedClients.length === 0
          ? <p className="client-no-clients">Nessun cliente trovato</p>
          : sortedClients.map(client => (
            <div key={client.id} className="client-card">
              <div className="client-info">
                <h3>{client.firstName} {client.lastName}</h3>
                <p><strong>Email:</strong> {client.email}</p>
                <p><strong>Telefono:</strong> {client.phone}</p>
                <p><strong>Compleanno:</strong> {client.dob}</p>
                <div className="client-stats">
                  <span className="client-stat">Attuali: {client.stamps.length}</span>
                  <span className="client-stat">Totali: {client.lifetimeStamps}</span>
                  <span className="client-stat">Premi: {client.rewardsEarned}</span>
                </div>
              </div>
              <div className="client-actions">
                <button onClick={() => openEditModal(client)} className="client-edit-btn">Modifica</button>
                <button onClick={() => openStampsModal(client)} className="client-stamps-btn">Timbri</button>
                <button onClick={() => showDeleteConfirmation(client.id, `${client.firstName} ${client.lastName}`)} className="client-delete-btn">Elimina</button>
              </div>
            </div>
          ))
        }
      </div>

      {/* … your modals and notifications go here (unchanged) … */}

    </div>
  );
}
