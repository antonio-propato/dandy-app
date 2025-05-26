import React, { useState, useEffect } from 'react';
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
  const [selectedClient, setSelectedClient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStampsModal, setShowStampsModal] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [notification, setNotification] = useState({ type: '', message: '' });
  const [editForm, setEditForm] = useState({});
  const [stampsData, setStampsData] = useState({});
  const [userData, setUserData] = useState(null);

  // Check if user is superuser
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
        // Store current user data for stamp attribution
        setUserData(userDoc.data());
        loadClients();
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      }
    };

    checkSuperUser();
  }, [navigate]);

  // Show notification helper
  const showNotificationMessage = (type, message) => {
    setNotification({ type, message });
    setShowNotification(true);
    setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };

  // Show confirmation dialog helper
  const showDeleteConfirmation = (clientId, clientName) => {
    setClientToDelete({ id: clientId, name: clientName });
    setShowConfirmDelete(true);
  };
  const capitalizeName = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Load all clients
  const loadClients = async () => {
    setLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      // Create stamps map for quick lookup
      const stampsMap = {};
      stampsSnapshot.docs.forEach(doc => {
        stampsMap[doc.id] = doc.data();
      });

      const clientsData = usersSnapshot.docs
        .filter(doc => doc.data().role !== 'superuser')
        .map(doc => {
          const userData = doc.data();
          const userStamps = stampsMap[doc.id] || {};
          return {
            id: doc.id,
            ...userData,
            stamps: userStamps.stamps || [],
            lifetimeStamps: userStamps.lifetimeStamps || 0,
            rewardsEarned: userStamps.rewardsEarned || 0
          };
        });

      setClients(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter clients based on search
  const filteredClients = clients.filter(client =>
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone.includes(searchTerm)
  );

  // Open edit modal
  const openEditModal = (client) => {
    setSelectedClient(client);
    setEditForm({
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      dob: client.dob
    });
    setShowEditModal(true);
  };

  // Open stamps management modal
  const openStampsModal = (client) => {
    setSelectedClient(client);
    setStampsData({
      currentStamps: client.stamps.length,
      lifetimeStamps: client.lifetimeStamps,
      rewardsEarned: client.rewardsEarned
    });
    setShowStampsModal(true);
  };

  // Update client information
  const updateClient = async () => {
    if (!selectedClient) return;

    try {
      await updateDoc(doc(firestore, 'users', selectedClient.id), {
        firstName: capitalizeName(editForm.firstName),
        lastName: capitalizeName(editForm.lastName),
        email: editForm.email.toLowerCase(),
        phone: editForm.phone,
        dob: editForm.dob
      });

      setShowEditModal(false);
      loadClients(); // Reload to see changes
      showNotificationMessage('success', 'Cliente aggiornato con successo!');
    } catch (error) {
      console.error('Error updating client:', error);
      showNotificationMessage('error', 'Errore nell\'aggiornamento del cliente');
    }
  };

  // Add manual stamp
  const addStamp = async () => {
    if (!selectedClient) return;

    try {
      const stampsRef = doc(firestore, 'stamps', selectedClient.id);
      const stampsDoc = await getDoc(stampsRef);

      if (stampsDoc.exists()) {
        const currentData = stampsDoc.data();
        const currentStamps = currentData.stamps || [];

        if (currentStamps.length >= 9) {
          showNotificationMessage('warning', 'Il cliente ha già 9 timbri. Deve riscattare il premio prima di aggiungerne altri.');
          return;
        }

        const newStamp = {
          date: new Date().toISOString(),
          addedBy: 'manual',
          addedByUser: auth.currentUser.uid,
          addedByName: userData ? `${userData.firstName} ${userData.lastName}` : 'Staff'
        };

        await updateDoc(stampsRef, {
          stamps: [...currentStamps, newStamp],
          lifetimeStamps: increment(1)
        });
      } else {
        // Create new stamps document
        await setDoc(stampsRef, {
          stamps: [{
            date: new Date().toISOString(),
            addedBy: 'manual',
            addedByUser: auth.currentUser.uid,
            addedByName: userData ? `${userData.firstName} ${userData.lastName}` : 'Staff'
          }],
          lifetimeStamps: 1,
          rewardsEarned: 0,
          rewardClaimed: false
        });
      }

      setShowStampsModal(false);
      loadClients();
      showNotificationMessage('success', 'Timbro aggiunto con successo!');
    } catch (error) {
      console.error('Error adding stamp:', error);
      showNotificationMessage('error', 'Errore nell\'aggiunta del timbro');
    }
  };

  // Remove stamp
  const removeStamp = async () => {
    if (!selectedClient) return;

    try {
      const stampsRef = doc(firestore, 'stamps', selectedClient.id);
      const stampsDoc = await getDoc(stampsRef);

      if (stampsDoc.exists()) {
        const currentData = stampsDoc.data();
        const currentStamps = currentData.stamps || [];

        if (currentStamps.length === 0) {
          showNotificationMessage('warning', 'Il cliente non ha timbri da rimuovere.');
          return;
        }

        // Remove the most recent stamp
        const updatedStamps = currentStamps.slice(0, -1);

        await updateDoc(stampsRef, {
          stamps: updatedStamps,
          lifetimeStamps: Math.max(0, (currentData.lifetimeStamps || 0) - 1)
        });

        setShowStampsModal(false);
        loadClients();
        showNotificationMessage('success', 'Timbro rimosso con successo!');
      }
    } catch (error) {
      console.error('Error removing stamp:', error);
      showNotificationMessage('error', 'Errore nella rimozione del timbro');
    }
  };

  // Delete client
  const deleteClient = async () => {
    if (!clientToDelete) return;

    try {
      // Delete user document
      await deleteDoc(doc(firestore, 'users', clientToDelete.id));

      // Delete stamps document if exists
      try {
        await deleteDoc(doc(firestore, 'stamps', clientToDelete.id));
      } catch (error) {
        // Stamps document might not exist, that's okay
      }

      setShowConfirmDelete(false);
      setClientToDelete(null);
      loadClients();
      showNotificationMessage('success', 'Cliente eliminato con successo!');
    } catch (error) {
      console.error('Error deleting client:', error);
      showNotificationMessage('error', 'Errore nell\'eliminazione del cliente');
    }
  };

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

      <div className="client-search-section">
        <input
          type="text"
          placeholder="Cerca per nome, email o telefono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="client-search-input"
        />
      </div>

      <div className="clients-list">
        {filteredClients.length === 0 ? (
          <p className="client-no-clients">Nessun cliente trovato</p>
        ) : (
          filteredClients.map(client => (
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
                <button onClick={() => openEditModal(client)} className="client-edit-btn">
                  Modifica
                </button>
                <button onClick={() => openStampsModal(client)} className="client-stamps-btn">
                  Timbri
                </button>
                <button onClick={() => showDeleteConfirmation(client.id, `${client.firstName} ${client.lastName}`)} className="client-delete-btn">
                  Elimina
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Client Modal */}
      {showEditModal && (
        <div className="client-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="client-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="client-modal-header">
              <h3>Modifica Cliente</h3>
              <button onClick={() => setShowEditModal(false)} className="client-close-button">×</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); updateClient(); }}>
              <div className="client-form-group">
                <label>Nome</label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({...editForm, firstName: e.target.value})}
                  required
                />
              </div>
              <div className="client-form-group">
                <label>Cognome</label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({...editForm, lastName: e.target.value})}
                  required
                />
              </div>
              <div className="client-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  required
                />
              </div>
              <div className="client-form-group">
                <label>Telefono</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                  required
                />
              </div>
              <div className="client-form-group">
                <label>Compleanno</label>
                <input
                  type="text"
                  placeholder="gg/mm"
                  value={editForm.dob}
                  onChange={(e) => setEditForm({...editForm, dob: e.target.value})}
                  required
                />
              </div>
              <div className="client-modal-actions">
                <button type="submit" className="client-save-btn">Salva</button>
                <button type="button" onClick={() => setShowEditModal(false)} className="client-cancel-btn">
                  Annulla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stamps Management Modal */}
      {showStampsModal && (
        <div className="client-modal-overlay" onClick={() => setShowStampsModal(false)}>
          <div className="client-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="client-modal-header">
              <h3>{selectedClient?.firstName} {selectedClient?.lastName}</h3>
              <button onClick={() => setShowStampsModal(false)} className="client-close-button">×</button>
            </div>
            <div className="client-stamps-info">
              <p><strong>Timbri Attuali:</strong> <span>{selectedClient?.stamps.length}</span></p>
              <p><strong>Timbri Totali:</strong> <span>{selectedClient?.lifetimeStamps}</span></p>
              <p><strong>Premi Riscattati:</strong> <span>{selectedClient?.rewardsEarned}</span></p>
            </div>
            <div className="client-modal-actions">
              <button onClick={addStamp} className="client-add-stamp-btn">
                Aggiungi Timbro
              </button>
              <button onClick={removeStamp} className="client-remove-stamp-btn">
                Rimuovi Timbro
              </button>
              <button onClick={() => setShowStampsModal(false)} className="client-cancel-btn">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Notification */}
      {showNotification && (
        <div className="client-notification-overlay">
          <div className={`client-notification client-notification-${notification.type}`}>
            <div className="client-notification-icon">
              {notification.type === 'success' && '✓'}
              {notification.type === 'error' && '✕'}
              {notification.type === 'warning' && '⚠'}
            </div>
            <div className="client-notification-message">{notification.message}</div>
            <button
              className="client-notification-close"
              onClick={() => setShowNotification(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="client-modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="client-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="client-confirm-header">
              <h3>Conferma Eliminazione</h3>
            </div>
            <div className="client-confirm-content">
              <div className="client-confirm-icon">⚠️</div>
              <p>Sei sicuro di voler eliminare <strong>{clientToDelete?.name}</strong>?</p>
              <p className="client-confirm-warning">Questa azione non può essere annullata.</p>
            </div>
            <div className="client-confirm-actions">
              <button onClick={deleteClient} className="client-confirm-delete-btn">
                Elimina
              </button>
              <button onClick={() => setShowConfirmDelete(false)} className="client-cancel-btn">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
