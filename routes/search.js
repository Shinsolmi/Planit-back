const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: '검색어가 없습니다.' });

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      {
        params: {
          query,
          key: apiKey,
          language: 'ko',
        },
      }
    );

    const places = response.data.results.map((p) => ({
      type: 'place',
      name: p.name,
      address: p.formatted_address,
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      image_url: p.photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${p.photos[0].photo_reference}&key=${apiKey}`
        : null,
    }));

    res.json(places);
  } catch (err) {
    console.error('Google Places API 오류:', err.response?.data || err.message);
    res.status(500).json({ error: '검색 실패', detail: err.message });
  }
});

module.exports = router;
