let allMovies = [];
let sortField = 'release_date';
let sortDir = 'desc';

const GENRES = [
  'ドキュメンタリー', 'コメディ', 'アクション', 'ヒューマンドラマ', 'ラブロマンス',
  'ホラー', 'サスペンス', 'SF', 'ファンタジー', '青春', '音楽', 'スポーツ', '歴史',
];

// ジャンルチェックボックスを初期化（編集モーダル・フィルタバー）
(function initGenreCheckboxes() {
  const editGroup = document.getElementById('editGenresGroup');
  const filterGroup = document.getElementById('genreFilterGroup');
  GENRES.forEach(g => {
    const editLabel = document.createElement('label');
    editLabel.innerHTML = `<input type="checkbox" name="editGenre" value="${g}"> ${g}`;
    editGroup.appendChild(editLabel);

    const filterLabel = document.createElement('label');
    filterLabel.innerHTML = `<input type="checkbox" name="filterGenre" value="${g}"> ${g}`;
    filterGroup.appendChild(filterLabel);
  });

  document.querySelectorAll('input[name="filterGenre"]').forEach(cb => {
    cb.addEventListener('change', renderMovies);
  });
})();

function updateDistributorFilter() {
  const select = document.getElementById('distributorFilter');
  const current = select.value;
  const distributors = [...new Set(allMovies.map(m => m.distributor).filter(Boolean))].sort();
  select.innerHTML = '<option value="">すべて</option>' +
    distributors.map(d => `<option value="${d}"${d === current ? ' selected' : ''}>${d}</option>`).join('');
}

function renderMovies() {
  const filterVal = document.getElementById('distributorFilter').value;
  const originVal = document.getElementById('originFilter').value;
  const formatVal = document.getElementById('formatFilter').value;
  const dateVal = document.getElementById('dateFilter').value;
  const selectedGenres = [...document.querySelectorAll('input[name="filterGenre"]:checked')].map(cb => cb.value);

  let movies = [...allMovies];
  if (filterVal) movies = movies.filter(m => m.distributor === filterVal);
  if (originVal) movies = movies.filter(m => m.origin === originVal);
  if (formatVal) movies = movies.filter(m => m.format === formatVal);
  if (dateVal) movies = movies.filter(m => m.release_date === dateVal);
  if (selectedGenres.length) movies = movies.filter(m => selectedGenres.every(g => (m.genres ?? []).includes(g)));

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
      <td>${m.video_type ?? '<span class="null">-</span>'}</td>
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
  document.getElementById('editVideoType').value = movie.video_type ?? '';

  // origin ラジオ
  document.querySelectorAll('input[name="editOrigin"]').forEach(r => {
    r.checked = (r.value === (movie.origin ?? ''));
  });
  // format ラジオ
  document.querySelectorAll('input[name="editFormat"]').forEach(r => {
    r.checked = (r.value === (movie.format ?? ''));
  });
  // genres チェックボックス
  const savedGenres = movie.genres ?? [];
  document.querySelectorAll('input[name="editGenre"]').forEach(cb => {
    cb.checked = savedGenres.includes(cb.value);
  });

  document.getElementById('editTitle').textContent = movie.title;
  document.getElementById('editModal').style.display = 'flex';
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const originVal = document.querySelector('input[name="editOrigin"]:checked')?.value || null;
  const formatVal = document.querySelector('input[name="editFormat"]:checked')?.value || null;
  const genresVal = [...document.querySelectorAll('input[name="editGenre"]:checked')].map(cb => cb.value);

  const body = {
    theater_count: document.getElementById('editTheaterCount').value || null,
    has_bonus: document.getElementById('editHasBonus').value === 'true',
    bonus_count: document.getElementById('editBonusCount').value || null,
    distributor: document.getElementById('editDistributor').value || null,
    memo: document.getElementById('editMemo').value || null,
    video_type: document.getElementById('editVideoType').value || null,
    origin: originVal,
    format: formatVal,
    genres: genresVal,
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
document.getElementById('originFilter').addEventListener('change', renderMovies);
document.getElementById('formatFilter').addEventListener('change', renderMovies);
document.getElementById('dateFilter').addEventListener('change', renderMovies);
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
