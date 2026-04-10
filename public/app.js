let allMovies = [];
let sortField = 'release_date';
let sortDir = 'desc';

function updateDistributorFilter() {
  const select = document.getElementById('distributorFilter');
  const current = select.value;
  const distributors = [...new Set(allMovies.map(m => m.distributor).filter(Boolean))].sort();
  select.innerHTML = '<option value="">すべて</option>' +
    distributors.map(d => `<option value="${d}"${d === current ? ' selected' : ''}>${d}</option>`).join('');
}

function renderMovies() {
  const filterVal = document.getElementById('distributorFilter').value;
  let movies = filterVal ? allMovies.filter(m => m.distributor === filterVal) : [...allMovies];

  movies.sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('movieList');
  tbody.innerHTML = '';
  movies.forEach(m => {
    const tr = document.createElement('tr');
    tr.dataset.id = m.id;
    tr.innerHTML = `
      <td>${m.title}</td>
      <td>${m.release_date}</td>
      <td class="editable" data-field="theater_count">${m.theater_count ?? '<span class="null">未入力</span>'}</td>
      <td>${m.youtube_views_release != null ? m.youtube_views_release.toLocaleString() : '<span class="null">取得待ち</span>'}</td>
      <td class="editable" data-field="has_bonus">${m.has_bonus ? 'あり' : 'なし'}</td>
      <td class="editable" data-field="bonus_count">${m.bonus_count ?? '<span class="null">-</span>'}</td>
      <td>${m.distributor ?? '<span class="null">-</span>'}</td>
      <td>${m.memo ?? '<span class="null">-</span>'}</td>
      <td><button class="editBtn">編集</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.editBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      openEditModal(tr.dataset.id);
    });
  });
}

function openEditModal(id) {
  const movie = allMovies.find(m => m.id === id);
  if (!movie) return;

  document.getElementById('editId').value = movie.id;
  document.getElementById('editTheaterCount').value = movie.theater_count ?? '';
  document.getElementById('editHasBonus').value = movie.has_bonus ? 'true' : '';
  document.getElementById('editBonusCount').value = movie.bonus_count ?? '';
  document.getElementById('editDistributor').value = movie.distributor ?? '';
  document.getElementById('editMemo').value = movie.memo ?? '';
  document.getElementById('editTitle').textContent = movie.title;
  document.getElementById('editModal').style.display = 'flex';
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const body = {
    theater_count: document.getElementById('editTheaterCount').value || null,
    has_bonus: document.getElementById('editHasBonus').value === 'true',
    bonus_count: document.getElementById('editBonusCount').value || null,
    distributor: document.getElementById('editDistributor').value || null,
    memo: document.getElementById('editMemo').value || null,
  };

  const res = await fetch(`/api/movies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    document.getElementById('editModal').style.display = 'none';
    loadMovies();
  } else {
    const err = await res.json();
    alert('エラー: ' + err.error);
  }
});

document.getElementById('cancelEdit').addEventListener('click', () => {
  document.getElementById('editModal').style.display = 'none';
});

async function loadMovies() {
  const res = await fetch('/api/movies');
  allMovies = await res.json();
  updateDistributorFilter();
  renderMovies();
}

document.getElementById('distributorFilter').addEventListener('change', renderMovies);
document.getElementById('reloadBtn').addEventListener('click', loadMovies);

document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.field;
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = 'asc';
    }
    document.querySelectorAll('th.sortable').forEach(t => {
      t.classList.remove('sort-asc', 'sort-desc');
    });
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    renderMovies();
  });
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById('title').value,
    release_date: document.getElementById('release_date').value,
    theater_count: document.getElementById('theater_count').value || null,
    has_bonus: document.getElementById('has_bonus').value === 'true',
    bonus_count: document.getElementById('bonus_count').value || null,
    distributor: document.getElementById('distributor').value || null,
    memo: document.getElementById('memo').value || null,
  };

  const res = await fetch('/api/movies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    e.target.reset();
    loadMovies();
  } else {
    const err = await res.json();
    alert('エラー: ' + err.error);
  }
});

async function loadDistributors() {
  const res = await fetch('/api/distributors');
  const distributors = await res.json();
  const options = distributors.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('distributor').innerHTML += options;
  document.getElementById('editDistributor').innerHTML += options;
}

loadDistributors();
loadMovies();
