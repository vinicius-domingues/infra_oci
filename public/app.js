document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const menuItems = document.querySelectorAll('.menu-item');
  const tabContents = document.querySelectorAll('.tab-content');
  
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all items
      menuItems.forEach(i => i.classList.remove('active'));
      // Add active to current
      item.classList.add('active');
      
      // Hide all tabs
      tabContents.forEach(tab => tab.classList.remove('active'));
      // Show correct tab
      const targetTab = document.getElementById(item.getAttribute('data-tab'));
      if (targetTab) {
        targetTab.classList.add('active');
      }
    });
  });

  // Client CRUD selectors
  const clientForm = document.getElementById('clientForm');
  const searchName = document.getElementById('searchName');
  const searchEmail = document.getElementById('searchEmail');
  const searchCpf = document.getElementById('searchCpf');
  const searchCpfStart = document.getElementById('searchCpfStart');
  const searchCpfEnd = document.getElementById('searchCpfEnd');
  const searchBtn = document.getElementById('searchBtn');
  const clientTableBody = document.getElementById('clientTableBody');
  const logConsole = document.getElementById('logConsole');
  
  // OCI Meta indicators
  const serverInstanceEl = document.getElementById('serverInstance');
  const databaseSourceEl = document.getElementById('databaseSource');
  const lastLatencyEl = document.getElementById('lastLatency');
  const dbQueryTimeEl = document.getElementById('dbQueryTime');
  const networkLatencyEl = document.getElementById('networkLatency');

  // Pagination elements
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const currentPageNum = document.getElementById('currentPageNum');

  let currentPage = 1;

  // Update OCI request details in the sidebar panel
  function updateMetadata(headers, duration) {
    const serverName = headers.get('x-server-instance') || 'Desconhecido';
    const dbSource = headers.get('x-database-source') || 'Desconhecido';
    const queryTime = headers.get('x-query-time');
    
    serverInstanceEl.textContent = serverName;
    databaseSourceEl.textContent = dbSource;
    lastLatencyEl.textContent = `${duration}ms`;
    
    if (queryTime !== null) {
      dbQueryTimeEl.textContent = `${queryTime}ms`;
      const qMs = parseInt(queryTime);
      if (qMs > 300) {
        dbQueryTimeEl.style.color = '#ef4444';
      } else if (qMs > 100) {
        dbQueryTimeEl.style.color = '#f59e0b';
      } else {
        dbQueryTimeEl.style.color = '#10b981';
      }
      
      // Calculate network latency (roundtrip minus database query time)
      const netTime = Math.max(0, duration - qMs);
      networkLatencyEl.textContent = `${netTime}ms`;
      if (netTime > 300) {
        networkLatencyEl.style.color = '#ef4444';
      } else if (netTime > 100) {
        networkLatencyEl.style.color = '#f59e0b';
      } else {
        networkLatencyEl.style.color = '#10b981';
      }
    } else {
      dbQueryTimeEl.textContent = '--';
      dbQueryTimeEl.style.color = 'inherit';
      networkLatencyEl.textContent = `${duration}ms`;
      if (duration > 500) {
        networkLatencyEl.style.color = '#ef4444';
      } else if (duration > 150) {
        networkLatencyEl.style.color = '#f59e0b';
      } else {
        networkLatencyEl.style.color = '#10b981';
      }
    }
    
    // Color code total latency (demora total)
    if (duration > 500) {
      lastLatencyEl.style.color = '#ef4444'; // Red
    } else if (duration > 150) {
      lastLatencyEl.style.color = '#f59e0b'; // Amber
    } else {
      lastLatencyEl.style.color = '#10b981'; // Green
    }
    
    return { serverName, dbSource, queryTime };
  }

  // Helper to log actions in the UI Console
  function logRequest(method, url, duration, status, server, db, queryTime = null) {
    const placeholder = logConsole.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();

    const logItem = document.createElement('div');
    logItem.className = `log-item ${method.toLowerCase()}`;
    
    const now = new Date().toLocaleTimeString();
    const dbStr = queryTime !== null ? `${queryTime}ms` : 'N/A';
    const netTime = queryTime !== null ? Math.max(0, duration - parseInt(queryTime)) : duration;
    
    logItem.innerHTML = `
      <span>[${now}] <strong>${method}</strong> ${url} - Status: <span class="log-time">${status}</span></span>
      <span class="log-time">Total: ${duration}ms (Rede: ${netTime}ms | Banco: ${dbStr}) [${server} | ${db}]</span>
    `;

    logConsole.insertBefore(logItem, logConsole.firstChild);
  }

  // Load clients when clicking search button
  async function loadClients() {
    const name = searchName.value.trim();
    const email = searchEmail.value.trim();
    const cpf = searchCpf.value.trim();
    const cpfStart = searchCpfStart.value.trim();
    const cpfEnd = searchCpfEnd.value.trim();

    if (!name && !email && !cpf && (!cpfStart || !cpfEnd)) {
      clientTableBody.innerHTML = `<tr><td colspan="7" class="table-placeholder">Por favor, preencha pelo menos um campo de busca e clique em Buscar.</td></tr>`;
      return;
    }

    clientTableBody.innerHTML = `<tr><td colspan="7" class="table-placeholder"><i class="fa-solid fa-spinner fa-spin"></i> Buscando clientes...</td></tr>`;

    const startTime = performance.now();
    const delayVal = document.getElementById('delay') ? document.getElementById('delay').value : 0;
    
    // Build query params
    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (email) params.append('email', email);
    if (cpf) params.append('cpf', cpf);
    if (cpfStart && cpfEnd) {
      params.append('cpfStart', cpfStart);
      params.append('cpfEnd', cpfEnd);
    }
    params.append('page', currentPage);
    params.append('delay', delayVal);

    const url = `/api/clients?${params.toString()}`;

    try {
      const response = await fetch(url);
      const duration = Math.round(performance.now() - startTime);
      
      const { serverName, dbSource, queryTime } = updateMetadata(response.headers, duration);
      logRequest('GET', `/api/clients?${params.toString().substring(0, 30)}...`, duration, response.status, serverName, dbSource, queryTime);

      if (response.ok) {
        const clients = await response.json();
        renderClients(clients);
        
        // Update pagination UI
        currentPageNum.textContent = currentPage;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = clients.length < 10;
      } else {
        clientTableBody.innerHTML = `<tr><td colspan="7" class="table-placeholder" style="color:var(--danger-color)">Erro ao carregar clientes.</td></tr>`;
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      clientTableBody.innerHTML = `<tr><td colspan="7" class="table-placeholder" style="color:var(--danger-color)">Falha de conexão com o servidor.</td></tr>`;
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
    }
  }

  function renderClients(clients) {
    if (clients.length === 0) {
      clientTableBody.innerHTML = `<tr><td colspan="7" class="table-placeholder">Nenhum cliente encontrado.</td></tr>`;
      return;
    }

    clientTableBody.innerHTML = clients.map(client => `
      <tr>
        <td>${client.id}</td>
        <td><strong>${escapeHtml(client.name)}</strong></td>
        <td>${escapeHtml(client.email)}</td>
        <td>${escapeHtml(client.cpf || '-')}</td>
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

  // Register client
  clientForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const cpf = document.getElementById('cpf').value;
    const phone = document.getElementById('phone').value;
    const delayVal = document.getElementById('delay').value || 0;

    const startTime = performance.now();
    try {
      const response = await fetch(`/api/clients?delay=${delayVal}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, cpf, phone })
      });

      const duration = Math.round(performance.now() - startTime);
      const { serverName, dbSource } = updateMetadata(response.headers, duration);
      logRequest('POST', '/api/clients', duration, response.status, serverName, dbSource);

      if (response.ok) {
        clientForm.reset();
        alert('Cliente cadastrado com sucesso!');
      } else {
        const err = await response.json();
        alert(err.error || 'Erro ao cadastrar cliente');
      }
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Falha de conexão com o servidor.');
    }
  });

  // Delete client
  async function deleteClient(id) {
    if (!confirm('Deseja realmente excluir este cliente?')) return;
    
    const startTime = performance.now();
    try {
      const response = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const duration = Math.round(performance.now() - startTime);

      const { serverName, dbSource } = updateMetadata(response.headers, duration);
      logRequest('DELETE', `/api/clients/${id}`, duration, response.status, serverName, dbSource);

      if (response.ok) {
        // Reload list
        loadClients();
      } else {
        alert('Erro ao excluir cliente');
      }
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Falha de conexão com o servidor.');
    }
  }

  // Trigger search on clicking the search button
  searchBtn.addEventListener('click', () => {
    currentPage = 1;
    loadClients();
  });

  // Trigger search on pressing Enter key on any input
  [searchName, searchEmail, searchCpf, searchCpfStart, searchCpfEnd].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        currentPage = 1;
        loadClients();
      }
    });
  });

  // Pagination navigation listeners
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadClients();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    currentPage++;
    loadClients();
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
});
