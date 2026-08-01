import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFonts } from 'expo-font';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STORAGE_KEY = '@card-cabinet/cards-v1';
const APP_VERSION = '1.1.1';
const RELEASES_API = 'https://api.github.com/repos/Cunninger/card-case/releases/latest';
const RELEASE_ASSET_MIRROR = 'https://gh-proxy.com/';
const BRAND_LOGO = require('./assets/card-case-logo.png');
const BRAND = {
  ink: '#18382F',
  inkDeep: '#102B24',
  ivory: '#F7F3EA',
  paper: '#FFFDF8',
  gold: '#C89B58',
  goldSoft: '#E7C991',
  taupe: '#6C5B4B',
  muted: '#7B7D76',
};
const CATEGORIES = [
  { id: 'bank', name: '银行卡', icon: 'card-outline', tone: '#516A9E' },
  { id: 'member', name: '会员卡', icon: 'sparkles-outline', tone: '#B57251' },
  { id: 'transit', name: '交通卡', icon: 'train-outline', tone: '#3D857E' },
  { id: 'id', name: '证件', icon: 'shield-checkmark-outline', tone: '#84659E' },
  { id: 'collect', name: '收藏卡', icon: 'albums-outline', tone: '#9C7840' },
  { id: 'other', name: '其他', icon: 'ellipsis-horizontal-circle-outline', tone: '#6E716D' },
];

const SEED_CARDS = [
  { id: 'seed-1', name: '星穹会员卡', issuer: '星穹生活', number: '••••  3278', category: 'member', color: '#B97552', expiry: '2027-12', note: '每月 8 号有会员日', favorite: true, image: null, createdAt: 1718800000000 },
  { id: 'seed-2', name: '城市通行卡', issuer: '上海公共交通', number: '••••  0621', category: 'transit', color: '#3B827B', expiry: '', note: '余额请在官方渠道查询', favorite: false, image: null, createdAt: 1718900000000 },
  { id: 'seed-3', name: '黑金优享卡', issuer: '云上百货', number: 'VIP  1880', category: 'member', color: '#252826', expiry: '2026-10', note: '线下门店可积分', favorite: false, image: null, createdAt: 1719000000000 },
];

const emptyDraft = () => ({ name: '', issuer: '', number: '', category: 'member', color: '#B57251', expiry: '', note: '', favorite: false, frontImage: null, backImage: null });
const categoryFor = (id) => CATEGORIES.find((item) => item.id === id) || CATEGORIES[5];
const compareVersions = (left, right) => {
  const leftParts = left.replace(/^v/i, '').split('.').map(Number);
  const rightParts = right.replace(/^v/i, '').split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
};

const haptic = (kind = 'selection') => {
  const action = kind === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : kind === 'impact'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.selectionAsync();
  action.catch(() => {});
};

function BrandMark({ size = 44, style }) {
  return <View accessibilityLabel="卡匣 Logo" style={[styles.brandMark, { width: size, height: size, borderRadius: Math.round(size * 0.29) }, style]}><Image source={BRAND_LOGO} resizeMode="cover" style={styles.brandMarkImage} /></View>;
}

function BrandSignature({ compact = false, inverse = false }) {
  return <View style={styles.brandSignature}><BrandMark size={compact ? 34 : 42} /><View><Text style={[styles.brandKicker, inverse && styles.brandKickerInverse]}>CARD CASE · PRIVATE ARCHIVE</Text><Text style={[styles.brandName, compact && styles.brandNameCompact, inverse && styles.brandNameInverse]}>卡匣</Text></View></View>;
}

function CardVisual({ card, compact = false, style }) {
  const category = categoryFor(card.category);
  const frontImage = card.frontImage || card.image;
  return (
    <View style={[styles.cardVisual, compact && styles.cardVisualCompact, style, { backgroundColor: card.color || category.tone }]}>
      {frontImage ? <Image source={{ uri: frontImage }} style={styles.cardImage} /> : null}
      <View style={styles.cardShade} />
      <View pointerEvents="none" style={showcaseStyles.cardGloss} />
      <View style={styles.cardTop}>
        <Text style={styles.cardIssuer}>{card.issuer || category.name}</Text>
        <Ionicons name={category.icon} size={compact ? 18 : 22} color="rgba(255,255,255,.92)" />
      </View>
      <View style={styles.cardBottom}>
        <Text numberOfLines={1} style={[styles.cardNumber, compact && styles.cardNumberCompact]}>{card.number || '未填写卡号'}</Text>
        {!compact && <Text numberOfLines={1} style={styles.cardNameOnCard}>{card.name || '未命名卡片'}</Text>}
      </View>
    </View>
  );
}

function Stat({ icon, label, value, tone }) {
  return <View style={styles.stat}><View style={[styles.statIcon, { backgroundColor: tone }]}><Ionicons name={icon} size={18} color="#fff" /></View><View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View></View>;
}

function CardShowcase({ cards, onOpen, onCreate }) {
  if (!cards.length) return <Pressable accessibilityLabel="收录第一张卡片" onPress={onCreate} style={showcaseStyles.showcaseEmpty}><Ionicons name="sparkles-outline" size={25} color="#D9BD8B" /><View><Text style={showcaseStyles.showcaseEmptyTitle}>建立你的第一组收藏</Text><Text style={showcaseStyles.showcaseEmptyHint}>收录一张实体卡，开启卡片展台</Text></View><Ionicons name="add-circle-outline" size={25} color="#D9BD8B" /></Pressable>;
  const deck = cards.slice(0, 3);
  const main = deck[0];
  return <Pressable accessibilityLabel={`打开卡片展台，目前主卡为 ${main.name}`} accessibilityHint="打开扇形卡册并浏览其他卡片" onPress={onOpen} style={({ pressed }) => [showcaseStyles.showcase, pressed && showcaseStyles.showcasePressed]}>
    <View pointerEvents="none" style={showcaseStyles.showcaseOrbOne} /><View pointerEvents="none" style={showcaseStyles.showcaseOrbTwo} />
    <View style={showcaseStyles.showcaseHead}><View><Text style={showcaseStyles.showcaseKicker}>CURATED DECK</Text><Text style={showcaseStyles.showcaseTitle}>本周展台</Text></View><View style={showcaseStyles.showcaseOpen}><Text style={showcaseStyles.showcaseOpenText}>轻触打开</Text><Ionicons name="arrow-forward" size={14} color="#E8D6B6" /></View></View>
    <View pointerEvents="none" style={showcaseStyles.showcaseDeck}>
      {deck[2] ? <CardVisual card={deck[2]} style={showcaseStyles.showcaseCardBackLeft} /> : null}
      {deck[1] ? <CardVisual card={deck[1]} style={showcaseStyles.showcaseCardBackRight} /> : null}
      <CardVisual card={main} style={showcaseStyles.showcaseCardFront} />
    </View>
  </Pressable>;
}

function FanCard({ card, index, progress, activeIndex, onPress }) {
  const motionStyle = useAnimatedStyle(() => {
    const offset = index - progress.value;
    const distance = Math.abs(offset);
    return {
      opacity: interpolate(distance, [0, 1, 3], [1, 0.8, 0.3], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(offset, [-3, 0, 3], [-153, 0, 153], Extrapolation.CLAMP) },
        { translateY: interpolate(distance, [0, 1, 3], [0, 14, 42], Extrapolation.CLAMP) },
        { rotate: `${interpolate(offset, [-3, 0, 3], [-30, 0, 30], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(distance, [0, 1, 3], [1, 0.9, 0.8], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[fanStyles.cardTouch, { zIndex: 20 - Math.abs(index - activeIndex) }, motionStyle]}><Pressable accessibilityLabel={`选择 ${card.name}`} onPress={onPress} style={fanStyles.cardPress}><CardVisual card={card} style={fanStyles.card} /></Pressable></Animated.View>;
}

function FanDeck({ open, cards, onClose, onSelect }) {
  const deck = cards.slice(0, 7);
  const [activeIndex, setActiveIndex] = useState(0);
  const progress = useSharedValue(0);
  const gestureStart = useSharedValue(0);
  const commitIndex = (index) => setActiveIndex(index);
  const choose = (index) => {
    const target = Math.max(0, Math.min(deck.length - 1, index));
    progress.value = withSpring(target, { damping: 17, stiffness: 190, mass: 0.68 });
    setActiveIndex(target);
  };
  const pan = Gesture.Pan().activeOffsetX([-10, 10]).failOffsetY([-18, 18]).onBegin(() => { gestureStart.value = progress.value; }).onUpdate((event) => {
    const raw = gestureStart.value - event.translationX / 155;
    const resisted = raw < 0 ? raw * 0.28 : raw > deck.length - 1 ? (deck.length - 1) + (raw - (deck.length - 1)) * 0.28 : raw;
    progress.value = resisted;
  }).onEnd((event) => {
    const start = Math.round(gestureStart.value);
    const flingOffset = -event.velocityX / 1200;
    const rawTarget = Math.round(progress.value + flingOffset);
    const target = Math.max(Math.max(0, start - 2), Math.min(Math.min(deck.length - 1, start + 2), rawTarget));
    progress.value = withSpring(target, { damping: 17, stiffness: 190, mass: 0.68 });
    runOnJS(commitIndex)(target);
  });
  if (!open) return null;
  const activeCard = deck[activeIndex];
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><GestureHandlerRootView style={fanStyles.gestureRoot}><SafeAreaView style={fanStyles.safe}><View style={fanStyles.header}><Pressable accessibilityLabel="关闭卡册" onPress={onClose} style={fanStyles.closeButton}><Ionicons name="close" size={24} color="#F9F7F0" /></Pressable><View><Text style={fanStyles.kicker}>PRIVATE CARD BOOK</Text><Text style={fanStyles.title}>扇形卡册</Text></View><Text style={fanStyles.counter}>{activeIndex + 1} / {deck.length}</Text></View><Text style={fanStyles.hint}>轻滑切换 · 快速甩动可跨两张</Text><GestureDetector gesture={pan}><View style={fanStyles.stage}>{deck.map((card, index) => <FanCard key={card.id} card={card} index={index} progress={progress} activeIndex={activeIndex} onPress={() => choose(index)} />)}</View></GestureDetector><View style={fanStyles.footer}><View style={fanStyles.pager}><Pressable accessibilityLabel="上一张卡片" disabled={activeIndex === 0} onPress={() => choose(activeIndex - 1)} style={[fanStyles.arrowButton, activeIndex === 0 && fanStyles.arrowDisabled]}><Ionicons name="chevron-back" size={22} color="#F9F7F0" /></Pressable><View style={fanStyles.caption}><Text numberOfLines={1} style={fanStyles.cardName}>{activeCard?.name}</Text><Text numberOfLines={1} style={fanStyles.cardMeta}>{categoryFor(activeCard?.category).name} · {activeCard?.issuer || '未填写机构'}</Text></View><Pressable accessibilityLabel="下一张卡片" disabled={activeIndex === deck.length - 1} onPress={() => choose(activeIndex + 1)} style={[fanStyles.arrowButton, activeIndex === deck.length - 1 && fanStyles.arrowDisabled]}><Ionicons name="chevron-forward" size={22} color="#F9F7F0" /></Pressable></View><Pressable accessibilityLabel={`查看 ${activeCard?.name} 的档案`} onPress={() => onSelect(activeCard)} style={fanStyles.detailButton}><Text style={fanStyles.detailButtonText}>查看档案</Text><Ionicons name="arrow-forward" size={18} color="#142E27" /></Pressable></View></SafeAreaView></GestureHandlerRootView></Modal>;
}

export default function App() {
  // Load the icon glyph file before first paint. Without this, Android can render
  // empty icon boxes on a cold launch even though the vector-icon package exists.
  const [iconsReady] = useFonts(Ionicons.font);
  const [cards, setCards] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('home');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [update, setUpdate] = useState({ status: 'idle', message: `当前版本 ${APP_VERSION}` });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setCards(JSON.parse(raw).map((card) => ({ ...card, frontImage: card.frontImage || card.image || null, backImage: card.backImage || null }))); else setCards(SEED_CARDS);
    }).catch(() => setCards(SEED_CARDS)).finally(() => setReady(true));
  }, []);

  useEffect(() => { if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); }, [cards, ready]);

  const visibleCards = useMemo(() => cards.filter((card) => {
    const needle = query.trim().toLowerCase();
    const matchesText = !needle || [card.name, card.issuer, card.number, card.note].some((part) => (part || '').toLowerCase().includes(needle));
    return matchesText && (filter === 'all' || card.category === filter);
  }), [cards, query, filter]);
  const favorites = cards.filter((card) => card.favorite);
  const expiring = cards.filter((card) => card.expiry && /^2026-(0[89]|1[0-2])$/.test(card.expiry)).length;

  const beginCreate = () => { haptic('impact'); setDraft(emptyDraft()); setEditorOpen(true); };
  const beginEdit = (card) => { setDraft({ ...card }); setSelected(null); setEditorOpen(true); };
  const saveCard = () => {
    if (!draft.name.trim()) { Alert.alert('还差一步', '请给这张卡片填写一个名称。'); return; }
    const item = { ...draft, name: draft.name.trim(), id: draft.id || `card-${Date.now()}`, createdAt: draft.createdAt || Date.now() };
    setCards((old) => draft.id ? old.map((card) => card.id === draft.id ? item : card) : [item, ...old]);
    haptic('success');
    setEditorOpen(false);
  };
  const toggleFavorite = (id) => setCards((old) => old.map((card) => card.id === id ? { ...card, favorite: !card.favorite } : card));
  const deleteCard = (card) => Alert.alert('删除这张卡？', '删除后无法恢复。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { setCards((old) => old.filter((item) => item.id !== card.id)); setSelected(null); } }]);
  const pickImage = async (side) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('需要相册权限', '请允许访问照片，才能为卡片添加实物照片。'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [16, 10], quality: 0.75 });
    if (result.canceled) return;
    try {
      // Picker URIs usually point to a temporary cache. Copying the photo into
      // documentDirectory makes it survive app restarts and keeps AsyncStorage
      // from referring to a file Android has already cleaned up.
      const sourceUri = result.assets[0].uri;
      const sourceExtension = sourceUri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'jpg';
      const cardPhotoDirectory = `${FileSystem.documentDirectory}card-photos`;
      await FileSystem.makeDirectoryAsync(cardPhotoDirectory, { intermediates: true });
      const persistentUri = `${cardPhotoDirectory}/card-${Date.now()}.${sourceExtension}`;
      await FileSystem.copyAsync({ from: sourceUri, to: persistentUri });
      setDraft((old) => ({ ...old, [side]: persistentUri }));
    } catch {
      Alert.alert('照片保存失败', '这张图片没有成功复制到本地，请重新选择一次。');
    }
  };
  const checkForUpdate = async () => {
    setUpdate({ status: 'checking', message: '正在检查 GitHub Release…' });
    try {
      const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (response.status === 404) { setUpdate({ status: 'none', message: '仓库暂未发布可下载版本' }); return; }
      if (!response.ok) throw new Error('release request failed');
      const release = await response.json();
      const version = String(release.tag_name || '').replace(/^v/i, '');
      const apkAsset = (release.assets || []).find((asset) => asset.name.toLowerCase().endsWith('.apk'));
      // Keep release metadata on GitHub, but route the potentially large APK
      // through a download mirror that is generally faster from mainland China.
      // Falling back to the Release page also keeps the update entry useful if
      // a release was accidentally published without an APK attachment.
      const downloadUrl = apkAsset?.browser_download_url
        ? `${RELEASE_ASSET_MIRROR}${apkAsset.browser_download_url}`
        : release.html_url;
      if (compareVersions(version, APP_VERSION) > 0) {
        setUpdate({ status: 'available', message: `发现新版本 ${version}，点此镜像下载`, version, downloadUrl });
      } else {
        setUpdate({ status: 'latest', message: `已是最新版本 ${APP_VERSION}` });
      }
    } catch {
      setUpdate({ status: 'error', message: '暂时无法连接 GitHub，请稍后重试' });
    }
  };
  const openUpdate = () => { if (update.downloadUrl) Linking.openURL(update.downloadUrl); };

  if (!ready || !iconsReady) return <SafeAreaView style={styles.loading}><Text style={styles.loadingText}>正在打开你的卡匣…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" backgroundColor="#F6F6F1" />
    {tab === 'home' ? <Home cards={cards} favorites={favorites} expiring={expiring} onCreate={beginCreate} onSelect={setSelected} onOpenShowcase={() => setShowcaseOpen(true)} onShowAll={() => setTab('cards')} /> : null}
    {tab === 'cards' ? <Collection cards={visibleCards} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} onCreate={beginCreate} onSelect={setSelected} /> : null}
    {tab === 'settings' ? <Settings cards={cards} update={update} onCheckUpdate={checkForUpdate} onOpenUpdate={openUpdate} onReset={() => Alert.alert('恢复示例数据？', '这会用示例卡片覆盖当前所有数据。', [{ text: '取消', style: 'cancel' }, { text: '恢复', style: 'destructive', onPress: () => setCards(SEED_CARDS) }])} /> : null}
    <BottomNav active={tab} onChange={setTab} />
    <FanDeck key={showcaseOpen ? 'open' : 'closed'} open={showcaseOpen} cards={cards} onClose={() => setShowcaseOpen(false)} onSelect={(card) => { setShowcaseOpen(false); setSelected(card); }} />
    <CardDetail card={selected} onClose={() => setSelected(null)} onEdit={beginEdit} onFavorite={toggleFavorite} onDelete={deleteCard} />
    <Editor open={editorOpen} draft={draft} setDraft={setDraft} onClose={() => setEditorOpen(false)} onSave={saveCard} onPickImage={pickImage} />
  </SafeAreaView>;
}

function Home({ cards, favorites, expiring, onCreate, onSelect, onOpenShowcase, onShowAll }) {
  return <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
    <View style={styles.homeHeader}><View><BrandSignature /><Text style={styles.pageTitle}>我的卡匣</Text></View><Pressable accessibilityLabel="新增卡片" accessibilityHint="收录一张新的实体卡" style={({ pressed }) => [styles.addRound, pressed && styles.addRoundPressed]} onPress={onCreate}><Ionicons name="add" size={25} color="#fff" /></Pressable></View>
    <View style={styles.archiveHero}><View pointerEvents="none" style={styles.heroHalo} /><View style={styles.heroTop}><View style={styles.heroArchiveLabel}><Ionicons name="sparkles-outline" size={14} color={BRAND.goldSoft} /><Text style={styles.heroKicker}>PRIVATE ARCHIVE</Text></View><View style={styles.localPill}><Ionicons name="shield-checkmark-outline" size={13} color="#E5D2AD" /><Text style={styles.localPillText}>仅存本机</Text></View></View><Text style={styles.heroTitle}>把每一张重要的{`\n`}卡，留在触手可及处。</Text><View style={styles.heroFoot}><View style={styles.heroMark}><BrandMark size={34} /></View><View><Text style={styles.heroFootOverline}>YOUR PRIVATE COLLECTION</Text><Text style={styles.heroFootText}>{cards.length ? `已悉心收录 ${cards.length} 张实体卡` : '从第一张实体卡开始建立档案'}</Text></View></View></View>
    <View style={styles.overview}><Stat icon="albums" label="已收录" value={`${cards.length} 张`} tone="#B57251" /><View style={styles.statDivider} /><Stat icon="heart" label="常用" value={`${favorites.length} 张`} tone="#B94E5B" /><View style={styles.statDivider} /><Stat icon="time" label="近期到期" value={`${expiring} 张`} tone="#B38C47" /></View>
    <CardShowcase cards={cards} onOpen={onOpenShowcase} onCreate={onCreate} />
    <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>常用卡片</Text><Text style={styles.sectionHint}>快速找到你最常用的那几张</Text></View><Pressable accessibilityLabel="查看全部卡片" onPress={() => { haptic(); onShowAll(); }} style={({ pressed }) => [styles.textLinkButton, pressed && styles.textLinkPressed]}><Text style={styles.textLink}>查看全部</Text><Ionicons name="arrow-forward" size={14} color={BRAND.taupe} /></Pressable></View>
    {favorites.length ? <FlatList horizontal data={favorites} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredList} renderItem={({ item }) => <Pressable accessibilityLabel={`查看 ${item.name}`} onPress={() => onSelect(item)} style={styles.featuredItem}><CardVisual card={item} /><Text numberOfLines={1} style={styles.featuredName}>{item.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{categoryFor(item.category).name} · {item.issuer}</Text></Pressable>} /> : <EmptyCompact onCreate={onCreate} />}
    <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>最近收录</Text><Text style={styles.sectionHint}>按加入时间排序</Text></View></View>
    {cards.slice(0, 4).map((item) => <CardRow key={item.id} card={item} onPress={() => onSelect(item)} />)}
  </ScrollView>;
}

function Collection({ cards, query, setQuery, filter, setFilter, onCreate, onSelect }) {
  return <View style={styles.screen}><View style={styles.collectionTop}><Text style={styles.pageTitle}>全部卡片</Text><Text style={styles.pageSubtitle}>共 {cards.length} 张，按类别和名称随时查找。</Text><View style={styles.searchBox}><Ionicons name="search" size={20} color="#777A73" /><TextInput value={query} onChangeText={setQuery} placeholder="搜索名称、机构或卡号" placeholderTextColor="#969991" style={styles.searchInput} /></View></View>
    <View style={styles.filterWrap}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}><Filter label="全部" active={filter === 'all'} onPress={() => setFilter('all')} />{CATEGORIES.map((item) => <Filter key={item.id} label={item.name} active={filter === item.id} onPress={() => setFilter(item.id)} />)}</ScrollView></View>
    <FlatList data={cards} keyExtractor={(item) => item.id} contentContainerStyle={styles.collectionList} renderItem={({ item }) => <CardRow card={item} onPress={() => onSelect(item)} />} ListEmptyComponent={<EmptyState onCreate={onCreate} />} showsVerticalScrollIndicator={false} />
  </View>;
}

function CardRow({ card, onPress }) { const category = categoryFor(card.category); return <Pressable accessibilityLabel={`查看 ${card.name}`} onPress={onPress} style={({ pressed }) => [styles.cardRow, pressed && styles.pressed]}><CardVisual card={card} compact /><View style={styles.rowInfo}><View style={styles.rowTitleLine}><Text numberOfLines={1} style={styles.rowName}>{card.name}</Text>{card.favorite ? <Ionicons name="heart" size={15} color="#BA5560" /> : null}</View><Text numberOfLines={1} style={styles.rowIssuer}>{card.issuer || category.name}</Text><View style={styles.rowFoot}><View style={[styles.categoryDot, { backgroundColor: category.tone }]} /><Text style={styles.rowCategory}>{category.name}</Text>{card.expiry ? <Text style={styles.rowExpiry}>有效期 {card.expiry}</Text> : null}</View></View><Ionicons name="chevron-forward" size={20} color="#B0B2AD" /></Pressable>; }
function Filter({ label, active, onPress }) { return <Pressable onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>; }
function EmptyCompact({ onCreate }) { return <Pressable onPress={onCreate} style={styles.emptyCompact}><Ionicons name="heart-outline" size={23} color="#A68A65" /><Text style={styles.emptyCompactText}>把常用的卡片标记为收藏</Text></Pressable>; }
function EmptyState({ onCreate }) { return <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="albums-outline" size={32} color="#A88158" /></View><Text style={styles.emptyTitle}>还没有符合条件的卡片</Text><Text style={styles.emptyBody}>试试更换筛选条件，或收录第一张实体卡。</Text><Pressable onPress={onCreate} style={styles.emptyButton}><Text style={styles.emptyButtonText}>收录卡片</Text></Pressable></View>; }

function BottomNav({ active, onChange }) {
  const items = [
    { id: 'home', label: '首页', icon: 'home-outline', activeIcon: 'home' },
    { id: 'cards', label: '卡片', icon: 'albums-outline', activeIcon: 'albums' },
    { id: 'settings', label: '设置', icon: 'settings-outline', activeIcon: 'settings' },
  ];
  return <View style={styles.bottomNav}>{items.map((item) => {
    const selected = item.id === active;
    return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label} onPress={() => { if (!selected) haptic(); onChange(item.id); }} style={({ pressed }) => [styles.navItem, selected && styles.navItemActive, pressed && styles.navItemPressed]}>
      <View style={styles.navIconSlot}><Ionicons name={selected ? item.activeIcon : item.icon} size={21} color={selected ? BRAND.ink : '#7A7E76'} />{selected ? <View style={styles.navDot} /> : null}</View>
      <Text style={[styles.navText, selected && styles.navTextActive]}>{item.label}</Text>
    </Pressable>;
  })}</View>;
}

function ImagePreview({ preview, onClose }) { if (!preview) return null; return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View style={previewStyles.root}><Pressable accessibilityLabel="关闭图片预览" onPress={onClose} style={previewStyles.backdrop} /><SafeAreaView style={previewStyles.safe}><View style={previewStyles.header}><View><Text style={previewStyles.kicker}>CARD PHOTO</Text><Text style={previewStyles.title}>{preview.label}</Text></View><Pressable accessibilityLabel="关闭图片预览" onPress={onClose} style={previewStyles.close}><Ionicons name="close" size={25} color="#F9F7F0" /></Pressable></View><Image accessibilityLabel={`${preview.label}大图`} source={{ uri: preview.uri }} resizeMode="contain" style={previewStyles.image} /><Text style={previewStyles.hint}>点击深色区域或右上角关闭</Text></SafeAreaView></View></Modal>; }
function CardDetail({ card, onClose, onEdit, onFavorite, onDelete }) {
  const [preview, setPreview] = useState(null);
  if (!card) return null;
  const category = categoryFor(card.category);
  const frontImage = card.frontImage || card.image;
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalShell}><Pressable style={styles.backdrop} onPress={onClose} /><ScrollView style={styles.detailSheet} contentContainerStyle={styles.detailSheetContent} showsVerticalScrollIndicator={false}>
    <View style={styles.sheetHandle} />
    <View style={styles.detailActions}><Pressable accessibilityLabel="关闭" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={23} color="#343832" /></Pressable><View style={styles.detailActionRight}><Pressable accessibilityLabel="编辑卡片" onPress={() => { haptic(); onEdit(card); }} style={styles.iconButton}><Ionicons name="pencil-outline" size={20} color="#343832" /></Pressable><Pressable accessibilityLabel={card.favorite ? '取消收藏' : '收藏'} onPress={() => { haptic('impact'); onFavorite(card.id); }} style={styles.iconButton}><Ionicons name={card.favorite ? 'heart' : 'heart-outline'} size={21} color={card.favorite ? '#BB5560' : '#343832'} /></Pressable></View></View>
    <View style={styles.detailArchiveHeader}><BrandSignature compact /><View style={styles.detailArchiveMeta}><View style={[styles.categoryDot, { backgroundColor: category.tone }]} /><Text style={styles.detailArchiveMetaText}>{category.name} · 实体档案</Text></View></View>
    <Text style={styles.photoSectionLabel}>卡片正面</Text><Pressable accessibilityLabel={frontImage ? '放大查看卡片正面' : '卡片正面未上传照片'} disabled={!frontImage} onPress={() => setPreview({ uri: frontImage, label: '卡片正面' })} style={previewStyles.trigger}><CardVisual card={card} />{frontImage ? <View pointerEvents="none" style={previewStyles.badge}><Ionicons name="expand-outline" size={15} color="#FFFDF7" /><Text style={previewStyles.badgeText}>原件预览</Text></View> : null}</Pressable>
    {card.backImage ? <View style={styles.backPhotoBlock}><Text style={styles.photoSectionLabel}>卡片反面</Text><Pressable accessibilityLabel="放大查看卡片反面" onPress={() => setPreview({ uri: card.backImage, label: '卡片反面' })} style={previewStyles.trigger}><Image source={{ uri: card.backImage }} style={styles.backCardImage} /><View pointerEvents="none" style={previewStyles.badge}><Ionicons name="expand-outline" size={15} color="#FFFDF7" /><Text style={previewStyles.badgeText}>原件预览</Text></View></Pressable></View> : <View style={styles.backPhotoMissing}><Ionicons name="copy-outline" size={18} color={BRAND.gold} /><Text style={styles.backPhotoMissingText}>尚未收录卡片反面</Text></View>}
    <Text style={styles.detailName}>{card.name}</Text><Text style={styles.detailIssuer}>{card.issuer || category.name}</Text><View style={styles.detailInfo}><InfoLine icon="business-outline" label="发卡机构" value={card.issuer || '未设置'} copyable={Boolean(card.issuer)} /><InfoLine icon="albums-outline" label="类别" value={category.name} copyable /><InfoLine icon="calendar-outline" label="有效期" value={card.expiry || '未设置'} copyable={Boolean(card.expiry)} /><InfoLine icon="card-outline" label="卡号 / 编号" value={card.number || '未设置'} copyable={Boolean(card.number)} />{card.note ? <InfoLine icon="document-text-outline" label="备注" value={card.note} multiline copyable /> : null}</View><Pressable onPress={() => { haptic('impact'); onDelete(card); }} style={styles.deleteButton}><Ionicons name="trash-outline" size={18} color="#B54A52" /><Text style={styles.deleteText}>删除此卡片</Text></Pressable>
  </ScrollView><ImagePreview preview={preview} onClose={() => setPreview(null)} /></View></Modal>;
}
function InfoLine({ icon, label, value, multiline, copyable = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(value);
      haptic('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      Alert.alert('复制失败', '暂时无法写入剪贴板，请稍后再试。');
    }
  };
  return <View style={[styles.infoLine, multiline && styles.infoLineTop]}><View style={styles.infoLabel}><Ionicons name={icon} size={19} color="#73766E" /><Text style={styles.infoLabelText}>{label}</Text></View><View style={[styles.infoValueWrap, multiline && styles.infoValueWrapMulti]}><Text selectable style={[styles.infoValue, styles.infoValueCopy, multiline && styles.infoValueMulti]}>{value}</Text>{copyable ? <Pressable accessibilityRole="button" accessibilityLabel={`复制${label}`} accessibilityHint={`复制${value}`} onPress={copy} style={({ pressed }) => [styles.copyButton, copied && styles.copyButtonDone, pressed && styles.copyButtonPressed]}><Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#FFFDF8' : BRAND.taupe} /><Text style={[styles.copyButtonText, copied && styles.copyButtonTextDone]}>{copied ? '已复制' : '复制'}</Text></Pressable> : null}</View></View>;
}

function Editor({ open, draft, setDraft, onClose, onSave, onPickImage }) {
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  return <Modal visible={open} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.editorSafe}>
    <View style={styles.editorHead}><Pressable onPress={onClose} style={styles.editorCancel}><Text style={styles.editorCancelText}>取消</Text></Pressable><Text style={styles.editorTitle}>{draft.id ? '编辑卡片' : '收录新卡'}</Text><Pressable onPress={onSave} style={styles.editorSave}><Text style={styles.editorSaveText}>保存</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.editorContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.formSection}>实体卡照片</Text><Text style={styles.photoHelper}>正反面会作为同一张卡片的完整档案，均保存在此设备。</Text>
      <Pressable accessibilityLabel="选择卡片正面照片" onPress={() => onPickImage('frontImage')} style={styles.photoPicker}><CardVisual card={draft} /><View style={styles.photoHint}><Ionicons name="image-outline" size={17} color="#6C6253" /><Text style={styles.photoHintText}>{draft.frontImage || draft.image ? '更换正面照片' : '添加正面照片'}</Text></View></Pressable>
      <Pressable accessibilityLabel="选择卡片反面照片" onPress={() => onPickImage('backImage')} style={styles.backPhotoPicker}>{draft.backImage ? <Image source={{ uri: draft.backImage }} style={styles.backCardImage} /> : <View style={styles.backPhotoPlaceholder}><Ionicons name="copy-outline" size={25} color="#98744F" /><Text style={styles.backPhotoTitle}>添加卡片反面</Text><Text style={styles.backPhotoHint}>银行卡请务必补全反面</Text></View>}<View style={styles.backPhotoBadge}><Ionicons name="image-outline" size={15} color="#6C6253" /><Text style={styles.backPhotoBadgeText}>{draft.backImage ? '更换反面照片' : '上传反面照片'}</Text></View></Pressable>
      <Text style={styles.formSection}>基本信息</Text><Field label="卡片名称 *" value={draft.name} onChangeText={(v) => set('name', v)} placeholder="例如：山姆卓越会员卡" /><Field label="发卡机构" value={draft.issuer} onChangeText={(v) => set('issuer', v)} placeholder="例如：山姆会员商店" /><Field label="卡号 / 编号" value={draft.number} onChangeText={(v) => set('number', v)} placeholder="建议只填写后四位或非敏感编号" /><Field label="有效期" value={draft.expiry} onChangeText={(v) => set('expiry', v)} placeholder="YYYY-MM" maxLength={7} /><Text style={styles.fieldLabel}>类别</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>{CATEGORIES.map((item) => <Pressable key={item.id} onPress={() => { set('category', item.id); if (!draft.id) set('color', item.tone); }} style={[styles.categoryChoice, draft.category === item.id && { backgroundColor: item.tone, borderColor: item.tone }]}><Ionicons name={item.icon} size={17} color={draft.category === item.id ? '#fff' : item.tone} /><Text style={[styles.categoryChoiceText, draft.category === item.id && { color: '#fff' }]}>{item.name}</Text></Pressable>)}</ScrollView><Text style={styles.fieldLabel}>卡片底色</Text><View style={styles.colorList}>{['#B57251','#516A9E','#3D857E','#84659E','#9C7840','#252826'].map((color) => <Pressable key={color} accessibilityLabel={`选择颜色 ${color}`} onPress={() => set('color', color)} style={[styles.colorDot, { backgroundColor: color }, draft.color === color && styles.colorDotActive]}>{draft.color === color ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</Pressable>)}</View><Field label="备注" value={draft.note} onChangeText={(v) => set('note', v)} placeholder="使用提示、门店信息等（请勿写密码或 CVV）" multiline /><Pressable onPress={() => set('favorite', !draft.favorite)} style={styles.favoriteToggle}><View style={[styles.switchTrack, draft.favorite && styles.switchTrackOn]}><View style={[styles.switchThumb, draft.favorite && styles.switchThumbOn]} /></View><View><Text style={styles.favoriteLabel}>设为常用卡片</Text><Text style={styles.favoriteHelp}>会显示在首页的快捷区域</Text></View></Pressable><View style={styles.privacyBox}><Ionicons name="lock-closed-outline" size={18} color="#747064" /><Text style={styles.privacyText}>所有内容仅保存在此设备本地，不会上传到服务器。</Text></View>
    </ScrollView>
  </SafeAreaView></Modal>;
}
function Field({ label, value, onChangeText, placeholder, multiline, maxLength }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9A9D95" style={[styles.input, multiline && styles.inputMulti]} multiline={multiline} maxLength={maxLength} textAlignVertical={multiline ? 'top' : 'center'} /></View>; }

function Settings({ cards, update, onCheckUpdate, onOpenUpdate, onReset }) {
  const updateAvailable = update.status === 'available';
  return <ScrollView style={styles.screen} contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
    <BrandSignature /><Text style={styles.pageTitle}>设置</Text><Text style={styles.pageSubtitle}>管理你的卡片资料与本地数据。</Text>
    <View style={styles.settingsGroup}><Text style={styles.settingsLabel}>数据与隐私</Text><View style={styles.settingsCard}><View style={styles.settingRow}><View style={styles.settingIcon}><Ionicons name="phone-portrait-outline" size={20} color="#5A635B" /></View><View style={styles.settingBody}><Text style={styles.settingName}>本地存储</Text><Text style={styles.settingHint}>当前设备已保存 {cards.length} 张卡片</Text></View><Ionicons name="checkmark-circle" size={21} color="#4E896B" /></View><View style={styles.settingRow}><View style={styles.settingIcon}><Ionicons name="shield-checkmark-outline" size={20} color="#5A635B" /></View><View style={styles.settingBody}><Text style={styles.settingName}>隐私提醒</Text><Text style={styles.settingHint}>请不要保存密码、CVV 等认证信息</Text></View></View></View></View>
    <View style={styles.settingsGroup}><Text style={styles.settingsLabel}>应用更新</Text><View style={styles.settingsCard}><Pressable accessibilityLabel="检查应用更新" onPress={() => { haptic(); (updateAvailable ? onOpenUpdate : onCheckUpdate)(); }} style={({ pressed }) => [styles.settingRow, pressed && styles.settingRowPressed]}><View style={[styles.settingIcon, updateAvailable && styles.updateIcon]}><Ionicons name={updateAvailable ? 'arrow-down-circle-outline' : 'cloud-download-outline'} size={20} color={updateAvailable ? '#8D5B38' : '#5A635B'} /></View><View style={styles.settingBody}><Text style={styles.settingName}>{updateAvailable ? `下载新版本 ${update.version}` : '检查更新'}</Text><Text style={styles.settingHint}>{update.message}</Text></View>{update.status === 'checking' ? <Ionicons name="sync" size={20} color="#8A6B48" /> : <Ionicons name={updateAvailable ? 'arrow-forward-circle' : 'chevron-forward'} size={21} color={updateAvailable ? '#A36C49' : '#A9ACA5'} />}</Pressable><Text style={styles.updateHelp}>版本信息来自 GitHub；APK 通过国内下载镜像获取。</Text></View></View>
    <View style={styles.settingsGroup}><Text style={styles.settingsLabel}>关于</Text><View style={[styles.settingsCard, styles.aboutCard]}><BrandSignature compact /><Text style={styles.aboutText}>版本 {APP_VERSION} · 离线实体卡管理</Text></View></View><Pressable onPress={() => { haptic('impact'); onReset(); }} style={styles.resetButton}><Text style={styles.resetText}>恢复示例数据</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  brandMark:{overflow:'hidden',backgroundColor:BRAND.ivory,shadowColor:'#4C3E2E',shadowOpacity:.16,shadowOffset:{width:0,height:4},shadowRadius:8,elevation:4},brandMarkImage:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},brandSignature:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:12},brandKicker:{fontSize:9,letterSpacing:1.05,fontWeight:'700',color:BRAND.taupe},brandKickerInverse:{color:'rgba(255,247,230,.72)'},brandName:{fontSize:18,lineHeight:23,fontWeight:'800',letterSpacing:-.4,color:BRAND.ink},brandNameCompact:{fontSize:16,lineHeight:20},brandNameInverse:{color:'#FFFDF8'},
  addRoundPressed:{transform:[{scale:.94}],opacity:.92},heroHalo:{position:'absolute',width:230,height:230,borderRadius:115,right:-78,top:-100,backgroundColor:'rgba(231,201,145,.12)'},heroArchiveLabel:{flexDirection:'row',alignItems:'center',gap:6},heroFootOverline:{fontSize:9,letterSpacing:1.1,fontWeight:'700',color:'rgba(231,201,145,.68)',marginBottom:3},
  textLinkButton:{minHeight:44,paddingHorizontal:3,flexDirection:'row',alignItems:'center',gap:4},textLinkPressed:{opacity:.62},navItemActive:{backgroundColor:'#F1ECE1',borderRadius:18},navItemPressed:{opacity:.72},navIconSlot:{height:25,alignItems:'center',justifyContent:'center'},navDot:{position:'absolute',bottom:-2,width:4,height:4,borderRadius:2,backgroundColor:BRAND.gold},
  detailArchiveHeader:{marginBottom:18,paddingBottom:15,borderBottomWidth:1,borderBottomColor:'#E8E2D8',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},detailArchiveMeta:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:9,paddingVertical:6,borderRadius:12,backgroundColor:'#F3EEE4'},detailArchiveMetaText:{fontSize:10,fontWeight:'700',color:BRAND.taupe},backPhotoMissing:{marginTop:18,height:54,borderRadius:14,backgroundColor:'#F4EFE6',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderWidth:1,borderColor:'#E6D9C5',borderStyle:'dashed'},backPhotoMissingText:{fontSize:12,color:BRAND.taupe,fontWeight:'600'},
  settingsCard:{overflow:'hidden',borderRadius:18,borderWidth:1,borderColor:'#E9E4DA',backgroundColor:BRAND.paper,shadowColor:'#41382D',shadowOpacity:.05,shadowOffset:{width:0,height:4},shadowRadius:10,elevation:1},settingRowPressed:{opacity:.68},aboutCard:{padding:16,gap:5},aboutText:{fontSize:12,color:'#777A73',marginLeft:43},
  infoValueWrap:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8,minWidth:0},infoValueWrapMulti:{alignItems:'flex-start'},infoValueCopy:{flex:0,flexShrink:1},copyButton:{height:36,minWidth:56,paddingHorizontal:9,borderRadius:11,backgroundColor:'#F3EEE4',borderWidth:1,borderColor:'#E4D7C4',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},copyButtonDone:{backgroundColor:BRAND.ink,borderColor:BRAND.ink},copyButtonPressed:{opacity:.68,transform:[{scale:.96}]},copyButtonText:{fontSize:11,fontWeight:'700',color:BRAND.taupe},copyButtonTextDone:{color:'#FFFDF8'},
  safe:{flex:1,backgroundColor:'#F6F6F1',paddingTop:Platform.OS==='android'?24:0},loading:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#F6F6F1',paddingTop:Platform.OS==='android'?24:0},loadingText:{color:'#565C55',fontSize:16},screen:{flex:1},screenContent:{paddingTop:20,paddingBottom:98},homeHeader:{paddingHorizontal:22,flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},eyebrow:{fontSize:10,letterSpacing:1.8,color:'#8A6B48',fontWeight:'700',marginBottom:6},pageTitle:{fontSize:31,lineHeight:39,color:'#182B25',fontWeight:'700',letterSpacing:-1},pageSubtitle:{fontSize:14,lineHeight:22,color:'#70756D',marginTop:5},addRound:{width:48,height:48,borderRadius:16,backgroundColor:'#182B25',alignItems:'center',justifyContent:'center',shadowColor:'#182B25',shadowOpacity:.18,shadowRadius:10,elevation:4},archiveHero:{marginHorizontal:22,marginTop:22,marginBottom:24,borderRadius:22,padding:20,backgroundColor:'#182B25',minHeight:174,justifyContent:'space-between',shadowColor:'#102019',shadowOpacity:.2,shadowRadius:16,elevation:5},heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroKicker:{fontSize:10,letterSpacing:1.7,fontWeight:'700',color:'#C8AC7E'},localPill:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:'rgba(229,210,173,.28)',borderRadius:14,paddingHorizontal:8,paddingVertical:5},localPillText:{fontSize:10,color:'#E5D2AD',fontWeight:'600'},heroTitle:{fontSize:22,lineHeight:30,letterSpacing:-.5,color:'#FCFAF4',fontWeight:'600'},heroFoot:{flexDirection:'row',alignItems:'center',gap:9},heroMark:{width:30,height:30,borderRadius:15,backgroundColor:'#D9BD8B',alignItems:'center',justifyContent:'center'},heroFootText:{fontSize:12,color:'rgba(252,250,244,.74)'},overview:{marginHorizontal:22,marginBottom:30,paddingVertical:16,backgroundColor:'#FEFEFA',borderRadius:18,flexDirection:'row',justifyContent:'space-around',borderWidth:1,borderColor:'#E9E8DF'},stat:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},statIcon:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center'},statValue:{fontSize:15,fontWeight:'700',color:'#182B25'},statLabel:{fontSize:11,color:'#858880',marginTop:1},statDivider:{height:31,width:1,backgroundColor:'#E5E4DC'},sectionHead:{marginHorizontal:22,marginBottom:13,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},sectionTitle:{fontSize:19,fontWeight:'700',color:'#182B25'},sectionHint:{fontSize:12,color:'#858880',marginTop:3},textLink:{fontSize:13,color:'#8A6241',fontWeight:'600',padding:7},featuredList:{paddingLeft:22,paddingRight:8,gap:14,paddingBottom:30},featuredItem:{width:230},featuredName:{fontSize:15,fontWeight:'700',color:'#182B25',marginTop:11},featuredMeta:{fontSize:12,color:'#82857E',marginTop:4},cardVisual:{height:144,borderRadius:17,overflow:'hidden',padding:16,justifyContent:'space-between',shadowColor:'#34312C',shadowOpacity:.18,shadowOffset:{width:0,height:5},shadowRadius:12,elevation:5},cardVisualCompact:{width:104,height:70,borderRadius:11,padding:9,shadowOpacity:.1,elevation:2},cardImage:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%',resizeMode:'cover'},cardShade:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(15,19,17,.18)'},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cardIssuer:{color:'#fff',fontSize:12,fontWeight:'600',maxWidth:'80%'},cardBottom:{gap:5},cardNumber:{color:'#fff',fontSize:17,letterSpacing:1.6,fontWeight:'500'},cardNumberCompact:{fontSize:10,letterSpacing:.8},cardNameOnCard:{color:'rgba(255,255,255,.88)',fontSize:12,fontWeight:'500'},emptyCompact:{height:108,borderRadius:16,borderWidth:1,borderStyle:'dashed',borderColor:'#D4C2AA',marginHorizontal:22,marginBottom:30,alignItems:'center',justifyContent:'center',gap:8},emptyCompactText:{fontSize:13,color:'#817565'},cardRow:{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:11,paddingHorizontal:22,backgroundColor:'#F6F6F1'},pressed:{opacity:.68},rowInfo:{flex:1,minWidth:0},rowTitleLine:{flexDirection:'row',alignItems:'center',gap:6},rowName:{fontSize:16,fontWeight:'650',color:'#182B25',flexShrink:1},rowIssuer:{fontSize:13,color:'#7E8279',marginTop:3},rowFoot:{flexDirection:'row',alignItems:'center',marginTop:7,gap:5},categoryDot:{width:6,height:6,borderRadius:3},rowCategory:{fontSize:11,color:'#777B73'},rowExpiry:{fontSize:11,color:'#94968F',marginLeft:5},collectionTop:{paddingTop:18,paddingHorizontal:22,paddingBottom:16},searchBox:{height:47,backgroundColor:'#ECEDE7',borderRadius:14,marginTop:20,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:9},searchInput:{flex:1,fontSize:15,color:'#182B25',height:'100%'},filterWrap:{height:47,borderBottomWidth:1,borderBottomColor:'#E6E5DE'},filterList:{paddingHorizontal:22,gap:8,alignItems:'center'},filter:{height:31,paddingHorizontal:13,borderRadius:16,backgroundColor:'#E9E9E3',justifyContent:'center'},filterActive:{backgroundColor:'#182B25'},filterText:{fontSize:13,color:'#686C65'},filterTextActive:{color:'#fff',fontWeight:'600'},collectionList:{paddingBottom:98},emptyState:{alignItems:'center',paddingTop:80,paddingHorizontal:38},emptyIcon:{width:64,height:64,borderRadius:22,backgroundColor:'#EEE6D9',alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:17,fontWeight:'700',color:'#182B25',marginTop:16},emptyBody:{fontSize:13,color:'#858880',textAlign:'center',lineHeight:20,marginTop:7},emptyButton:{marginTop:20,backgroundColor:'#182B25',borderRadius:12,paddingHorizontal:18,paddingVertical:11},emptyButtonText:{color:'#fff',fontWeight:'600'},bottomNav:{position:'absolute',bottom:0,left:0,right:0,height:72,paddingHorizontal:20,paddingBottom:Platform.OS==='android'?6:0,backgroundColor:'rgba(254,254,250,.98)',borderTopWidth:1,borderTopColor:'#E5E3DC',flexDirection:'row',alignItems:'center',justifyContent:'space-around'},navItem:{flex:1,height:54,alignItems:'center',justifyContent:'center',gap:3},navText:{fontSize:10,color:'#7A7E76'},navTextActive:{color:'#182B25',fontWeight:'700'},modalShell:{flex:1,justifyContent:'flex-end'},backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(22,26,23,.46)'},detailSheet:{backgroundColor:'#FAFAF6',borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:'90%'},detailSheetContent:{paddingHorizontal:22,paddingBottom:34},sheetHandle:{height:4,width:38,borderRadius:2,backgroundColor:'#C7C9C1',alignSelf:'center',marginTop:10},detailActions:{height:62,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},detailActionRight:{flexDirection:'row',gap:8},iconButton:{height:44,width:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#EFF0EB'},photoSectionLabel:{fontSize:12,fontWeight:'700',letterSpacing:.7,color:'#8A6B48',marginBottom:9},backPhotoBlock:{marginTop:20},backCardImage:{width:'100%',height:180,borderRadius:16,resizeMode:'cover',backgroundColor:'#E8E8E2'},detailName:{fontSize:25,fontWeight:'700',color:'#182B25',marginTop:20},detailIssuer:{fontSize:14,color:'#7E827A',marginTop:4},detailInfo:{marginTop:23,borderTopWidth:1,borderTopColor:'#E5E5DE'},infoLine:{minHeight:55,borderBottomWidth:1,borderBottomColor:'#E5E5DE',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14},infoLineTop:{paddingVertical:14,alignItems:'flex-start'},infoLabel:{flexDirection:'row',alignItems:'center',gap:8,minWidth:95},infoLabelText:{fontSize:13,color:'#72766E'},infoValue:{fontSize:14,color:'#182B25',fontWeight:'500',flex:1,textAlign:'right'},infoValueMulti:{lineHeight:20,fontWeight:'400'},deleteButton:{marginTop:22,height:48,borderRadius:13,borderWidth:1,borderColor:'#E8C6C7',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},deleteText:{fontSize:14,fontWeight:'600',color:'#B54A52'},editorSafe:{flex:1,backgroundColor:'#F7F7F2'},editorHead:{height:58,paddingHorizontal:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#FCFCF8',borderBottomWidth:1,borderBottomColor:'#E8E7E0'},editorTitle:{fontSize:16,fontWeight:'700',color:'#182B25'},editorCancel:{minWidth:45,paddingVertical:10},editorCancelText:{color:'#6D716A',fontSize:15},editorSave:{backgroundColor:'#182B25',borderRadius:9,paddingHorizontal:13,paddingVertical:7},editorSaveText:{color:'#fff',fontSize:14,fontWeight:'700'},editorContent:{padding:20,paddingBottom:45},photoHelper:{fontSize:12,color:'#7E817A',lineHeight:18,marginTop:-1,marginBottom:13},photoPicker:{position:'relative',marginBottom:14},photoHint:{position:'absolute',bottom:10,alignSelf:'center',backgroundColor:'rgba(255,253,247,.9)',borderRadius:18,paddingHorizontal:12,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:5},photoHintText:{fontSize:12,fontWeight:'600',color:'#5C574D'},backPhotoPicker:{height:150,borderRadius:16,overflow:'hidden',backgroundColor:'#EBEAE3',marginBottom:26,position:'relative'},backPhotoPlaceholder:{flex:1,alignItems:'center',justifyContent:'center',gap:5,borderWidth:1,borderStyle:'dashed',borderColor:'#CFC3B0',borderRadius:16},backPhotoTitle:{fontSize:14,fontWeight:'700',color:'#5A5144'},backPhotoHint:{fontSize:12,color:'#82786A'},backPhotoBadge:{position:'absolute',bottom:10,alignSelf:'center',backgroundColor:'rgba(255,253,247,.92)',borderRadius:18,paddingHorizontal:12,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:5},backPhotoBadgeText:{fontSize:12,fontWeight:'600',color:'#5C574D'},formSection:{fontSize:13,fontWeight:'700',letterSpacing:.6,color:'#8A6B48',marginBottom:5},field:{marginTop:16},fieldLabel:{fontSize:13,color:'#555A53',fontWeight:'600',marginBottom:8},input:{minHeight:48,borderWidth:1,borderColor:'#DEDCD4',backgroundColor:'#FCFCF8',borderRadius:12,paddingHorizontal:13,fontSize:15,color:'#182B25'},inputMulti:{height:92,paddingTop:12},categoryList:{gap:8,paddingBottom:3},categoryChoice:{height:39,borderRadius:11,borderWidth:1,borderColor:'#DFDED6',paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#FCFCF8'},categoryChoiceText:{fontSize:13,fontWeight:'600',color:'#4F554E'},colorList:{flexDirection:'row',gap:13,marginBottom:4},colorDot:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},colorDotActive:{borderWidth:2,borderColor:'#F7F7F2',shadowColor:'#333',shadowOpacity:.3,shadowRadius:3,elevation:3},favoriteToggle:{marginTop:23,padding:14,borderRadius:14,backgroundColor:'#ECEDE7',flexDirection:'row',gap:12,alignItems:'center'},switchTrack:{width:40,height:24,borderRadius:12,backgroundColor:'#B5B8B0',padding:3,justifyContent:'center'},switchTrackOn:{backgroundColor:'#8A6241'},switchThumb:{width:18,height:18,borderRadius:9,backgroundColor:'#fff'},switchThumbOn:{alignSelf:'flex-end'},favoriteLabel:{fontSize:14,fontWeight:'700',color:'#182B25'},favoriteHelp:{fontSize:12,color:'#7C8078',marginTop:2},privacyBox:{marginTop:16,flexDirection:'row',gap:9,padding:12,backgroundColor:'#F1E9DE',borderRadius:12},privacyText:{fontSize:12,color:'#716658',lineHeight:18,flex:1},settingsContent:{padding:22,paddingBottom:98},settingsGroup:{marginTop:28},settingsLabel:{fontSize:12,fontWeight:'700',letterSpacing:.6,color:'#8A6B48',marginBottom:9},settingRow:{minHeight:72,backgroundColor:'#FEFEFA',borderBottomWidth:1,borderBottomColor:'#E7E6E0',padding:13,flexDirection:'row',alignItems:'center',gap:12},settingIcon:{width:38,height:38,borderRadius:12,backgroundColor:'#E8ECE5',alignItems:'center',justifyContent:'center'},settingBody:{flex:1},settingName:{fontSize:15,fontWeight:'650',color:'#182B25'},settingHint:{fontSize:12,color:'#7E817A',marginTop:3},updateIcon:{backgroundColor:'#F1E3D0'},updateHelp:{fontSize:12,color:'#83867E',lineHeight:18,paddingHorizontal:13,paddingTop:9,backgroundColor:'#FEFEFA'},resetButton:{alignSelf:'center',marginTop:38,paddingVertical:9,paddingHorizontal:12},resetText:{fontSize:13,color:'#A24E54'}
});

const showcaseStyles = StyleSheet.create({
  cardGloss: { position: 'absolute', width: '38%', height: '180%', top: '-38%', left: '40%', backgroundColor: 'rgba(255,255,255,.12)', transform: [{ rotate: '24deg' }] },
  showcase: { height: 222, marginHorizontal: 22, marginBottom: 30, borderRadius: 23, backgroundColor: '#132F28', overflow: 'hidden', padding: 17, shadowColor: '#102019', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 8 }, shadowRadius: 16, elevation: 6 },
  showcasePressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  showcaseOrbOne: { position: 'absolute', width: 176, height: 176, borderRadius: 88, backgroundColor: 'rgba(225,188,122,.16)', right: -50, top: -64 },
  showcaseOrbTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: 'rgba(225,188,122,.18)', left: -45, bottom: -46 },
  showcaseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  showcaseKicker: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', color: '#C8AC7E' },
  showcaseTitle: { fontSize: 19, fontWeight: '700', color: '#FCFAF4', marginTop: 3 },
  showcaseOpen: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8 },
  showcaseOpenText: { fontSize: 11, color: '#E8D6B6', fontWeight: '600' },
  showcaseDeck: { position: 'absolute', left: 0, right: 0, top: 80, bottom: 0 },
  showcaseCardFront: { position: 'absolute', left: 48, right: 48, height: 126, zIndex: 3, transform: [{ rotate: '-1deg' }], shadowOpacity: 0.28, elevation: 8 },
  showcaseCardBackLeft: { position: 'absolute', left: -35, width: 195, height: 118, zIndex: 1, opacity: 0.76, transform: [{ rotate: '-14deg' }], shadowOpacity: 0.1, elevation: 1 },
  showcaseCardBackRight: { position: 'absolute', right: -34, width: 195, height: 118, zIndex: 2, opacity: 0.8, transform: [{ rotate: '13deg' }], shadowOpacity: 0.12, elevation: 2 },
  showcaseEmpty: { minHeight: 96, marginHorizontal: 22, marginBottom: 30, borderRadius: 20, paddingHorizontal: 17, backgroundColor: '#132F28', flexDirection: 'row', alignItems: 'center', gap: 13 },
  showcaseEmptyTitle: { fontSize: 15, fontWeight: '700', color: '#FCFAF4' },
  showcaseEmptyHint: { fontSize: 12, color: 'rgba(252,250,244,.68)', marginTop: 3 },
});

const fanStyles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#102B24', paddingTop: Platform.OS === 'android' ? 24 : 0 },
  header: { height: 76, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.11)', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', color: '#C8AC7E', textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#F9F7F0', marginTop: 3, textAlign: 'center' },
  counter: { minWidth: 48, fontSize: 13, fontWeight: '700', color: '#DCC89E', textAlign: 'right' },
  hint: { color: 'rgba(249,247,240,.64)', textAlign: 'center', fontSize: 12, marginTop: 10 },
  stage: { height: 380, marginTop: 26, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  cardTouch: { position: 'absolute', width: 240, height: 154, left: '50%', marginLeft: -120 },
  cardPress: { flex: 1 },
  card: { width: 240, height: 154, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.32, shadowOffset: { width: 0, height: 9 }, shadowRadius: 15, elevation: 9 },
  footer: { marginTop: 'auto', paddingHorizontal: 22, paddingBottom: 28 },
  pager: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  arrowButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.28 },
  caption: { flex: 1, minWidth: 0, alignItems: 'center' },
  cardName: { maxWidth: '100%', fontSize: 16, fontWeight: '700', color: '#F9F7F0' },
  cardMeta: { maxWidth: '100%', fontSize: 12, color: 'rgba(249,247,240,.62)', marginTop: 3 },
  detailButton: { height: 52, borderRadius: 16, backgroundColor: '#E5CCA1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailButtonText: { fontSize: 15, fontWeight: '700', color: '#142E27' },
});

const previewStyles = StyleSheet.create({
  trigger: { position: 'relative' },
  badge: { position: 'absolute', right: 11, bottom: 11, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(16,43,36,.8)', flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: { color: '#FFFDF7', fontSize: 11, fontWeight: '700' },
  root: { flex: 1, backgroundColor: 'rgba(7,20,16,.96)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  safe: { flex: 1, paddingTop: Platform.OS === 'android' ? 24 : 0 },
  header: { minHeight: 76, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: '#C8AC7E', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#F9F7F0', fontSize: 18, fontWeight: '700', marginTop: 3 },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' },
  image: { flex: 1, width: '100%', marginVertical: 18 },
  hint: { color: 'rgba(249,247,240,.62)', fontSize: 12, textAlign: 'center', paddingHorizontal: 24, paddingBottom: 28 },
});
