document.addEventListener('DOMContentLoaded', () => {
  const clientForm = document.getElementById('clientForm');
  const searchInput = document.getElementById('searchInput');
  const clientTableBody = document.getElementById('clientTableBody');
  const logConsole = document.getElementById('logConsole');
  const getLastTime = document.getElementById('getLastTime');
  const postLastTime = document.getElementById('postLastTime');

  // Helper to log action and duration
  function logRequest(method, url, duration, status) {
    // Remove placeholder
    const placeholder = logConsole.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();

    const logItem = document.createElement('div');
    logItem.className = `log-item ${method.toLowerCase()}`;
    
    const now = new Date().toLocaleTimeString();
    logItem.innerHTML = `
      <span>[${now}] <strong>${method}</strong> ${url} - <span class="log-time">${status}</span></span>
      <span class="log-time">${duration} ms</span>
    `;

    logConsole.insertBefore(logItem, logConsole.firstChild);
  }

  // Load clients with response-time monitoring
  async function loadClients(search = '') {
    const startTime = performance.now();
    const delayVal = document.getElementById('delay').value || 0;
    const url = `/api/clients?search=${encodeURIComponent(search)}&delay=${delayVal}`;

    try {
      const response = await fetch(url);
      const duration = Math.round(performance.now() - startTime);
      
      getLastTime.textContent = `${duration}ms`;
      getLastTime.style.color = duration > 200 ? '#f59e0b' : '#10b981'; // warning color if slow

      logRequest('GET', `/api/clients`, duration, response.status);

      if (response.ok) {
        const clients = await response.json();
        renderClients(clients);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  }

  function renderClients(clients) {
    if (clients.length === 0) {
      clientTableBody.innerHTML = `<tr><td colspan="6" class="table-placeholder">Nenhum cliente encontrado.</td></tr>`;
      return;
    }

    clientTableBody.innerHTML = clients.map(client => `
      <tr>
        <td>${client.id}</td>
        <td><strong>${escapeHtml(client.name)}</strong></td>
        <td>${escapeHtml(client.email)}</td>
        <td>${escapeHtml(client.phone || '-')}</td>
        <td>${new Date(client.created_at).toLocaleString()}</td>
        <td>
          <button class="btn-delete" data-id="${client.id}">Excluir</button>
        </td>
      </tr>
    `).join('');

    // Attach delete listeners
    document.querySelectorAll('.btn-delete').forEach(button => {
      button.addEventListener('click', () => deleteClient(button.getAttribute('data-id')));
    });
  }

  // Register a client with response-time monitoring
  clientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const delayVal = document.getElementById('delay').value || 0;

    const startTime = performance.now();
    try {
      const response = await fetch(`/api/clients?delay=${delayVal}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone })
      });

      const duration = Math.round(performance.now() - startTime);
      postLastTime.textContent = `${duration}ms`;
      postLastTime.style.color = duration > 200 ? '#f59e0b' : '#10b981';

      logRequest('POST', '/api/clients', duration, response.status);

      if (response.ok) {
        clientForm.reset();
        loadClients();
      } else {
        const err = await response.json();
        alert(err.error || 'Erro ao cadastrar cliente');
      }
    } catch (error) {
      console.error('Error creating client:', error);
    }
  });

  // Delete a client with response-time monitoring
  async function deleteClient(id) {
    if (!confirm('Deseja realmente excluir este cliente?')) return;
    
    const startTime = performance.now();
    try {
      const response = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const duration = Math.round(performance.now() - startTime);

      logRequest('DELETE', `/api/clients/${id}`, duration, response.status);

      if (response.ok) {
        loadClients();
      } else {
        alert('Erro ao excluir cliente');
      }
    } catch (error) {
      console.error('Error deleting client:', error);
    }
  }

  // Search filter
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadClients(e.target.value);
    }, 300);
  });

  // Helper to escape HTML and prevent XSS
  function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial Load
  loadClients();
});
