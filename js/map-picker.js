// ===== OpenStreetMap スポット選択・追加 =====

import * as spotStore from './spot-store.js';
import { COLOR } from './theme.js';

const SHINAGAWA_CENTER = [35.6092, 139.7302];
const FIXED_AREAS = ['品川', '大崎', '荏原', '大井', '八潮'];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
}

function distanceMeters(aLat, aLng, bLat, bLng) {
    const rad = value => value * Math.PI / 180;
    const earth = 6371000;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const x = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function requireLeaflet() {
    if (!window.L) throw new Error('地図ライブラリを読み込めませんでした。通信状態を確認してください。');
    return window.L;
}

export function openMapPicker({ onSelect, onSaved, manage = false, initialSpotId = '' } = {}) {
    let leaflet;
    try {
        leaflet = requireLeaflet();
    } catch (error) {
        alert(error.message);
        return;
    }

    document.getElementById('spot-map-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'spot-map-modal';
    modal.className = 'modal-overlay map-modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet map-modal-sheet">
        <div class="modal-head">
          <div><div class="modal-title">${manage ? 'スポットを管理' : '地図からスポットを選択'}</div><div class="modal-sub">${manage ? 'ピンを選択して編集するか、新しいスポットを追加できます。' : 'ピンを選択するか、新しいスポットを追加できます。'}</div></div>
          <button class="btn btn-secondary btn-sm" id="map-close" aria-label="閉じる">閉じる</button>
        </div>
        <div class="map-toolbar">
          <button class="btn btn-secondary btn-sm" id="map-current">現在地周辺</button>
          <button class="btn btn-secondary btn-sm" id="map-add">スポットを追加</button>
        </div>
        <div class="spot-map" id="spot-map" aria-label="活動スポット地図"></div>
        <div class="map-status text-sm" id="map-status" role="status" aria-live="polite"></div>
        <div id="map-panel"></div>
      </div>`;
    document.body.appendChild(modal);

    const map = leaflet.map('spot-map', { zoomControl: true }).setView(SHINAGAWA_CENTER, 13);
    leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markerLayer = leaflet.layerGroup().addTo(map);
    let draftMarker = null;
    let addMode = false;

    function close() {
        map.remove();
        modal.remove();
    }

    function chooseSpot(spot) {
        document.getElementById('map-panel').innerHTML = `
          <div class="map-selection-card">
            <div class="map-selection-area">${escapeHtml(spot.area)}${spot.locality ? ` ／ ${escapeHtml(spot.locality)}` : ''}</div>
            <div class="map-selection-name">${escapeHtml(spot.spot)}</div>
            ${manage
                ? '<button class="btn btn-primary btn-full" id="map-edit">このピンを編集</button>'
                : '<button class="btn btn-primary btn-full" id="map-confirm">この場所を選択</button>'}
          </div>`;
        document.getElementById('map-confirm')?.addEventListener('click', () => {
            onSelect?.(spot);
            close();
        });
        document.getElementById('map-edit')?.addEventListener('click', () => showSpotForm(spot));
    }

    function renderMarkers() {
        markerLayer.clearLayers();
        for (const spot of spotStore.getAllSpots()) {
            if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) continue;
            const marker = leaflet.marker([spot.lat, spot.lng], { title: spot.spot }).addTo(markerLayer);
            marker.bindTooltip(spot.spot, { direction: 'top' });
            marker.on('click', () => chooseSpot(spot));
        }
    }

    function showSpotForm(existing, latlng = null) {
        const editing = Boolean(existing);
        const point = latlng || { lat: existing.lat, lng: existing.lng };
        if (draftMarker) draftMarker.setLatLng(point);
        else draftMarker = leaflet.marker(point, { draggable: true }).addTo(map);
        const panel = document.getElementById('map-panel');
        panel.innerHTML = `
          <form class="map-add-form" id="map-add-form">
            <div class="map-selection-name">${editing ? 'スポットを編集' : '新しいスポット'}</div>
            <p class="section-note">ピンはドラッグして位置を調整できます。</p>
            <div class="form-row">
              <div class="form-group"><label class="form-label">地区</label><select class="form-select" id="map-area" required><option value="">選択</option>${FIXED_AREAS.map(area => `<option value="${area}" ${existing?.area === area ? 'selected' : ''}>${area}</option>`).join('')}</select></div>
              <div class="form-group"><label class="form-label">地名</label><input class="form-input" id="map-locality" maxlength="100" placeholder="例：戸越" value="${escapeHtml(existing?.locality || '')}"></div>
            </div>
            <div class="form-group"><label class="form-label">スポット名</label><input class="form-input" id="map-name" maxlength="100" required placeholder="例：駅東口" value="${escapeHtml(existing?.spot || '')}"></div>
            <button class="btn btn-primary btn-full" type="submit">${editing ? '変更を保存' : 'このピンを保存'}</button>
            ${existing?.isPresetOverride ? '<button class="btn btn-secondary btn-full" type="button" id="map-reset" style="margin-top:8px;">標準の名称・位置に戻す</button>' : ''}
            ${editing ? '<button class="btn btn-danger btn-full" type="button" id="map-delete" style="margin-top:8px;">このピンを削除</button>' : ''}
          </form>`;
        draftMarker.off('dragend');
        draftMarker.on('dragend', () => document.getElementById('map-status').textContent = 'ピン位置を更新しました。');
        panel.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const point = draftMarker.getLatLng();
            try {
                const values = {
                    area: document.getElementById('map-area').value,
                    locality: document.getElementById('map-locality').value,
                    spot: document.getElementById('map-name').value,
                    lat: point.lat,
                    lng: point.lng,
                };
                const saved = editing
                    ? spotStore.saveSpotChanges(existing.id, values)
                    : spotStore.addCustomSpot(values);
                draftMarker.remove();
                draftMarker = null;
                addMode = false;
                renderMarkers();
                onSaved?.(saved);
                chooseSpot(saved);
                document.getElementById('map-status').textContent = editing ? 'スポットの変更を保存しました。' : '新しいスポットを保存しました。';
            } catch (error) {
                document.getElementById('map-status').textContent = error.message;
            }
        });
        document.getElementById('map-reset')?.addEventListener('click', () => {
            if (!confirm('このスポットを標準の名称・位置に戻しますか？')) return;
            spotStore.resetPresetSpot(existing.id);
            draftMarker.remove();
            draftMarker = null;
            const reset = spotStore.getSpotById(existing.id);
            renderMarkers();
            onSaved?.(reset);
            chooseSpot(reset);
            map.setView([reset.lat, reset.lng], Math.max(map.getZoom(), 16));
            document.getElementById('map-status').textContent = '標準の名称・位置に戻しました。';
        });
        document.getElementById('map-delete')?.addEventListener('click', () => {
            const message = `「${existing.spot}」のピンを削除します。\n活動記録は削除されません。\nこの操作は取り消せません。続行しますか？`;
            if (!confirm(message)) return;
            if (!spotStore.deleteSpot(existing.id)) {
                document.getElementById('map-status').textContent = 'ピンを削除できませんでした。';
                return;
            }
            draftMarker.remove();
            draftMarker = null;
            addMode = false;
            renderMarkers();
            onSaved?.(null);
            panel.innerHTML = '<div class="map-selection-card"><div class="map-selection-name">ピンを削除しました。</div><p class="section-note">活動記録は残っています。</p></div>';
            document.getElementById('map-status').textContent = 'ピンを削除しました。';
        });
    }

    document.getElementById('map-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.getElementById('map-add').addEventListener('click', () => {
        addMode = true;
        document.getElementById('map-status').textContent = '地図上の追加したい位置をタップしてください。';
    });
    map.on('click', event => {
        if (!addMode) return;
        showSpotForm(null, event.latlng);
    });

    document.getElementById('map-current').addEventListener('click', () => {
        const status = document.getElementById('map-status');
        if (!navigator.geolocation) {
            status.textContent = 'この端末では位置情報を利用できません。';
            return;
        }
        status.textContent = '現在地を確認しています…';
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude, accuracy } = position.coords;
            map.setView([latitude, longitude], 16);
            leaflet.circle([latitude, longitude], { radius: Math.max(accuracy, 15), color: COLOR.accent, fillOpacity: .12 }).addTo(map);
            const nearby = spotStore.getAllSpots()
                .filter(spot => Number.isFinite(spot.lat) && Number.isFinite(spot.lng))
                .map(spot => ({ ...spot, distance: distanceMeters(latitude, longitude, spot.lat, spot.lng) }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3);
            status.textContent = nearby.length ? '現在地に近いスポットです。' : '周辺に登録済みスポットがありません。新規追加できます。';
            if (nearby.length) {
                document.getElementById('map-panel').innerHTML = `<div class="nearby-list">${nearby.map(spot => `
                  <button type="button" class="nearby-item" data-id="${escapeHtml(spot.id)}">
                    <span>${escapeHtml(spot.spot)}</span><strong>約${Math.round(spot.distance)}m</strong>
                  </button>`).join('')}</div>`;
                document.querySelectorAll('.nearby-item').forEach(button => button.addEventListener('click', () => {
                    const spot = nearby.find(item => item.id === button.dataset.id);
                    if (spot) chooseSpot(spot);
                }));
            }
        }, error => {
            status.textContent = error.code === 1
                ? '位置情報の利用が許可されていません。地図から手動で選択してください。'
                : '現在地を取得できませんでした。地図から手動で選択してください。';
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    });

    renderMarkers();
    if (initialSpotId) {
        const initial = spotStore.getSpotById(initialSpotId);
        if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lng)) {
            map.setView([initial.lat, initial.lng], 16);
            showSpotForm(initial);
        }
    }
    setTimeout(() => map.invalidateSize(), 0);
}
