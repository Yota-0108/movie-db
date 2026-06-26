require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 配給会社名 → YouTubeチャンネルID
const DISTRIBUTOR_CHANNEL_MAP = {
  '東宝':               'UCTDMT3aL30noTVFgNPA9XtQ',
  '東映':               'UCKtn-oZON38D0v7bLopdqDA',
  '松竹':               'UCulneJtjMARpEHhWQTlGa6w',
  'KADOKAWA':           'UCHjj-qlJhYWDacFwnaewV6Q',
  'KADOKAWA Anime':     'UCY5fcqgSrQItPAX_Z5Frmwg',
  'avex':               'UCKlXiCjg_VI0eZ9kKBeNJgw',
  'GAGA':               'UCaPosffCG5qIORTZUcx-IKg',
  '東京テアトル':       'UCIfX73iNlxOuMBNU9o07wmQ',
  'キノフィルムズ':     'UC9snK46BPugKo2hnr-syeKQ',
  'ハピネットファントム': 'UCAzEmvg00LdRHOHVfOTjcHQ',
  'Asmik Ace':          'UCBuAshczy8ouqLU_H381row',
  'TWIN ENGINE':        'UC5S8dDswLqbnm9fuZ8Z2ntQ',
  'ナカチカピクチャーズ': 'UCP8I83WIYaVrczhJndYErAg',
  'トランスフォーマー':  'UCAmXsN8EZCLZxV6PQhhQdZQ',
  'ディズニースタジオ':  'UCCC2KYMK8Xq3Qs6WheLJJmw',
  '20世紀スタジオ':     'UCkvOiP-XrHCDvAoGPC3lZrA',
  'スターウォーズ':     'UCGzKKabQ36Chhas5nermAGA',
  'ユニバーサルピクチャーズ': 'UC9llDCAObCbGpsaa66fClKw',
  'イルミネーション':              'UCi0I8qQOvOO0OZlBYovFYdg',
  'ソニーピクチャーズ':  'UCx-l79NDhpI8GDyl_A_C1Ew',
  'パラマウントピクチャーズ': 'UCUTi1VedwlfXWEQa3EpN_0A',
  'ワーナーブラザース':  'UCSrwpEM8lBM4jR5YoKX3XOQ',
  'ヨーロッパ企画':     'UC2TbJKsHgrYCbLxKBI8fpXQ',
  'ビターズ・エンド':   'UCoSEan3p30GgsBNJ6VNtbDA',
  'ケロロチャンネル':   'UCPKVAsHJPUd8vslgQJMPvjg',
};

// YouTube予告動画を検索して再生数を取得
async function getTrailerViews(movieTitle, distributor) {
  try {
    const channelId = DISTRIBUTOR_CHANNEL_MAP[distributor];
    if (!channelId) {
      console.warn(`Unknown distributor: "${distributor}"`);
      return null;
    }

    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: movieTitle,
        type: 'video',
        channelId,
        order: 'relevance',
        maxResults: 50,
        key: process.env.YOUTUBE_API_KEY,
      },
    });

    const items = searchRes.data.items || [];

    if (!items.length) return null;

    const normalize = s => s
      .toLowerCase()
      .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 全角英数記号→半角
      .replace(/　/g, ' ')
      .trim();
    const matched = items.filter(item =>
      normalize(item.snippet.title).includes(normalize(movieTitle))
    );
    if (!matched.length) return null;

    // 絞り込んだ動画のstatisticsをまとめて取得
    const ids = matched.map(item => item.id.videoId).join(',');
    const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'statistics,status',
        id: ids,
        key: process.env.YOUTUBE_API_KEY,
      },
    });

    if (!statsRes.data.items?.length) return null;

    // 公開動画のみに絞り込む
    const publicItems = statsRes.data.items.filter(
      item => item.status?.privacyStatus === 'public'
    );
    if (!publicItems.length) return null;

    // 再生数が最も多いものを選ぶ
    const best = publicItems.reduce((a, b) => {
      return parseInt(a.statistics?.viewCount || 0) >= parseInt(b.statistics?.viewCount || 0) ? a : b;
    });
    const matchedSnippet = matched.find(item => item.id.videoId === best.id);

    return {
      videoId: best.id,
      viewCount: parseInt(best.statistics?.viewCount || 0),
      title: matchedSnippet?.snippet.title ?? '',
    };
  } catch (err) {
    console.error('YouTube API error:', err.message);
    return null;
  }
}

// 公開当日に再生数を取得してDBを更新
async function fetchViewsForTodaysMovies() {
  const today = new Date().toISOString().split('T')[0];

  const { data: movies, error } = await supabase
    .from('movies')
    .select('*')
    .eq('release_date', today);

  if (error || !movies?.length) return;

  for (const movie of movies) {
    const result = await getTrailerViews(movie.title, movie.distributor);
    if (!result) continue;

    await supabase
      .from('movies')
      .update({
        youtube_views_release: result.viewCount,
        youtube_video_id: result.videoId,
      })
      .eq('id', movie.id);

    console.log(`Updated views for "${movie.title}": ${result.viewCount}`);
  }
}

// 毎日 9:00(JST) に公開当日の再生数を取得
cron.schedule('20 22 * * *', () => {
  console.log('Running daily cron: fetching release day views...');
  fetchViewsForTodaysMovies();
}, { timezone: 'Asia/Tokyo' });

// 手動で今日の再生数を取得
app.post('/api/fetch-views', async (req, res) => {
  await fetchViewsForTodaysMovies();
  res.json({ ok: true });
});

// 作品登録
app.post('/api/movies', async (req, res) => {
  const { title, release_date, theater_count, has_bonus, bonus_count, distributor, memo } = req.body;

  if (!title || !release_date) {
    return res.status(400).json({ error: 'タイトルと公開日は必須です' });
  }

  const { data, error } = await supabase
    .from('movies')
    .insert([{ title, release_date, theater_count, has_bonus, bonus_count, distributor, memo }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// 配給会社一覧取得
app.get('/api/distributors', (req, res) => {
  res.json(Object.keys(DISTRIBUTOR_CHANNEL_MAP));
});

// 作品一覧取得
app.get('/api/movies', async (req, res) => {
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .order('release_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 作品更新（上映館数・特典情報の手動更新用）
app.patch('/api/movies/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const { data, error } = await supabase
    .from('movies')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
