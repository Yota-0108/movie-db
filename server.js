require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 公式配給会社のYouTubeチャンネルID
const OFFICIAL_CHANNELS = [
  'UCdel3JEXDMbFMkMCBbsHBBg', // 東宝
  'UC8HNiIBFuADMWAoNGdgJMvg', // 東映
  'UCfhG9PjoBPGgSCBqHsQjlLQ', // 松竹
  'UCt5TqISGfcIUGFHDHkJKtOg', // ウォルトディズニー
  'UC6AKivyBX3HpOgnx7OCQF0w', // ユニバーサルピクチャーズ
  'UCACof5s6TeCFiIZYRVgJS1A', // 東宝東和
  'UCkH3CcMfqww9RsZvPRPkAJA', // 任天堂
];

// YouTube予告動画を検索して再生数を取得
async function getTrailerViews(movieTitle) {
  try {
    const channelQuery = OFFICIAL_CHANNELS.map(id => `channelId=${id}`).join('|');
    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: `${movieTitle} 予告`,
        type: 'video',
        channelId: OFFICIAL_CHANNELS.join(','),
        order: 'relevance',
        maxResults: 5,
        key: process.env.YOUTUBE_API_KEY,
      },
    });

    const items = searchRes.data.items;
    if (!items || items.length === 0) return null;

    // チャンネルIDが公式かどうか確認
    const officialVideo = items.find(item =>
      OFFICIAL_CHANNELS.includes(item.snippet.channelId)
    );
    if (!officialVideo) return null;

    const videoId = officialVideo.id.videoId;

    // 再生数取得
    const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'statistics',
        id: videoId,
        key: process.env.YOUTUBE_API_KEY,
      },
    });

    const stats = statsRes.data.items[0]?.statistics;
    return {
      videoId,
      viewCount: parseInt(stats?.viewCount || 0),
      title: officialVideo.snippet.title,
    };
  } catch (err) {
    console.error('YouTube API error:', err.message);
    return null;
  }
}

// 公開当日（金曜）に再生数を取得してDBを更新
async function fetchViewsForTodaysMovies() {
  const today = new Date().toISOString().split('T')[0];

  const { data: movies, error } = await supabase
    .from('movies')
    .select('*')
    .eq('release_date', today);

  if (error || !movies?.length) return;

  for (const movie of movies) {
    const result = await getTrailerViews(movie.title);
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

// 毎週金曜 9:00 に公開当日の再生数を取得
cron.schedule('0 9 * * 5', () => {
  console.log('Running Friday cron: fetching release day views...');
  fetchViewsForTodaysMovies();
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
