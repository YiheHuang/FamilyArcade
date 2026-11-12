/**
 * Original Idiom Chain dictionary.
 *
 * The idioms themselves are traditional phrases in the public domain. This
 * project's selection, frequency labels, pinyin and English glosses were written
 * for Family Arcade. Nothing here is copied from a corpus or a commercial list.
 *
 * Format: text|pinyin (one syllable per character)|short English gloss|frequency
 * Frequency is a family-familiarity label: 5 = everyday, 1 = uncommon. Anything
 * at 2 or below is scored as a rare idiom by the engine.
 */

export interface Idiom {
  readonly text: string;
  readonly pinyin: string;
  readonly gloss: string;
  readonly frequency: 1 | 2 | 3 | 4 | 5;
}

const RAW = `
爱不释手|ài bù shì shǒu|cannot put it down|4
爱屋及乌|ài wū jí wū|love me, love my dog|2
安分守己|ān fèn shǒu jǐ|know one's place|3
安居乐业|ān jū lè yè|live and work in peace|4
安然无恙|ān rán wú yàng|safe and sound|4
按部就班|àn bù jiù bān|follow the proper order|3
暗箭伤人|àn jiàn shāng rén|stab someone in the back|2
拔苗助长|bá miáo zhù zhǎng|pull seedlings to help them grow|3
百发百中|bǎi fā bǎi zhòng|every shot hits the mark|3
百感交集|bǎi gǎn jiāo jí|mixed feelings|3
百花齐放|bǎi huā qí fàng|let a hundred flowers bloom|3
百家争鸣|bǎi jiā zhēng míng|a hundred schools of thought contend|3
百战百胜|bǎi zhàn bǎi shèng|win every battle|3
百折不挠|bǎi zhé bù náo|unyielding|3
班门弄斧|bān mén nòng fǔ|show off before an expert|2
半途而废|bàn tú ér fèi|give up halfway|4
包罗万象|bāo luó wàn xiàng|all-embracing|2
饱经风霜|bǎo jīng fēng shuāng|weather-beaten|2
杯水车薪|bēi shuǐ chē xīn|a drop in the bucket|2
悲欢离合|bēi huān lí hé|joys and sorrows, partings and reunions|3
背道而驰|bèi dào ér chí|run counter to|2
笨鸟先飞|bèn niǎo xiān fēi|the slow bird starts early|3
比翼双飞|bǐ yì shuāng fēi|fly wing to wing|2
闭关自守|bì guān zì shǒu|shut oneself off|2
变化多端|biàn huà duō duān|full of changes|3
别出心裁|bié chū xīn cái|original in approach|2
别具一格|bié jù yī gé|have a style of one's own|3
彬彬有礼|bīn bīn yǒu lǐ|polite and courteous|3
兵荒马乱|bīng huāng mǎ luàn|chaos of war|2
兵来将挡|bīng lái jiàng dǎng|meet force with force|2
并驾齐驱|bìng jià qí qū|run neck and neck|2
波澜壮阔|bō lán zhuàng kuò|magnificent|3
不耻下问|bù chǐ xià wèn|not ashamed to ask inferiors|3
不出所料|bù chū suǒ liào|as expected|3
不辞而别|bù cí ér bié|leave without saying goodbye|3
不打自招|bù dǎ zì zhāo|confess without being pressed|2
不得而知|bù dé ér zhī|unknown|3
不甘示弱|bù gān shì ruò|unwilling to admit defeat|3
不慌不忙|bù huāng bù máng|unhurried|4
不假思索|bù jiǎ sī suǒ|without thinking|3
不见不散|bù jiàn bù sàn|be there or be square|4
不劳而获|bù láo ér huò|reap without sowing|3
不谋而合|bù móu ér hé|agree without planning|3
不期而遇|bù qī ér yù|meet by chance|3
不求甚解|bù qiú shèn jiě|not seek deep understanding|2
不屈不挠|bù qū bù náo|indomitable|4
不约而同|bù yuē ér tóng|act in unison|3
不知所措|bù zhī suǒ cuò|at a loss|4
不自量力|bù zì liàng lì|overestimate oneself|3
步调一致|bù diào yī zhì|in step|3
才高八斗|cái gāo bā dǒu|gifted|2
财源广进|cái yuán guǎng jìn|wealth flows in|3
参差不齐|cēn cī bù qí|uneven|3
层出不穷|céng chū bù qióng|emerge endlessly|3
察言观色|chá yán guān sè|read faces|3
畅所欲言|chàng suǒ yù yán|speak freely|2
车水马龙|chē shuǐ mǎ lóng|heavy traffic|3
沉默寡言|chén mò guǎ yán|taciturn|3
称心如意|chèn xīn rú yì|after one's heart|2
成家立业|chéng jiā lì yè|marry and establish a career|3
成千上万|chéng qiān shàng wàn|tens of thousands|4
诚心诚意|chéng xīn chéng yì|sincere|4
出类拔萃|chū lèi bá cuì|outstanding|3
出人意料|chū rén yì liào|unexpected|4
出生入死|chū shēng rù sǐ|risk life and limb|3
出神入化|chū shén rù huà|superb|2
触景生情|chù jǐng shēng qíng|memories stirred by the scene|3
川流不息|chuān liú bù xī|flowing endlessly|3
穿针引线|chuān zhēn yǐn xiàn|act as a go-between|2
春暖花开|chūn nuǎn huā kāi|spring warmth and flowers|3
唇亡齿寒|chún wáng chǐ hán|if the lips are gone, the teeth are cold|2
从容不迫|cóng róng bù pò|calm and unhurried|3
粗心大意|cū xīn dà yì|careless|4
寸步难行|cùn bù nán xíng|unable to move a step|3
错落有致|cuò luò yǒu zhì|pleasingly uneven|2
大材小用|dà cái xiǎo yòng|waste talent|3
大惊小怪|dà jīng xiǎo guài|make a fuss|4
大器晚成|dà qì wǎn chéng|great talents mature late|3
大同小异|dà tóng xiǎo yì|largely the same|3
大显身手|dà xiǎn shēn shǒu|display one's skill|3
大摇大摆|dà yáo dà bǎi|swagger|3
呆若木鸡|dāi ruò mù jī|frozen like a wooden chicken|2
待人接物|dài rén jiē wù|the way one treats people|2
单刀直入|dān dāo zhí rù|come straight to the point|2
当机立断|dāng jī lì duàn|decide on the spot|3
道听途说|dào tīng tú shuō|hearsay|3
得意忘形|dé yì wàng xíng|get carried away|3
德高望重|dé gāo wàng zhòng|respected for virtue|3
灯红酒绿|dēng hóng jiǔ lǜ|scene of revelry|2
滴水穿石|dī shuǐ chuān shí|drops of water wear through stone|3
地大物博|dì dà wù bó|vast land and abundant resources|3
点石成金|diǎn shí chéng jīn|turn stone into gold|2
雕虫小技|diāo chóng xiǎo jì|insignificant skill|2
调兵遣将|diào bīng qiǎn jiàng|deploy forces|2
东奔西走|dōng bēn xī zǒu|rush about|3
东张西望|dōng zhāng xī wàng|look around|4
动人心弦|dòng rén xīn xián|touching|3
独当一面|dú dāng yī miàn|take charge of a task alone|2
独树一帜|dú shù yī zhì|develop a distinctive style|3
独一无二|dú yī wú èr|unique|4
多才多艺|duō cái duō yì|versatile|4
多此一举|duō cǐ yī jǔ|unnecessary|4
多多益善|duō duō yì shàn|the more the better|3
发人深省|fā rén shēn xǐng|thought-provoking|2
翻天覆地|fān tiān fù dì|earth-shaking|3
反败为胜|fǎn bài wéi shèng|turn defeat into victory|3
防患未然|fáng huàn wèi rán|prevent trouble before it happens|2
放虎归山|fàng hǔ guī shān|let a tiger back to the mountain|2
废寝忘食|fèi qǐn wàng shí|forget food and sleep|3
分秒必争|fēn miǎo bì zhēng|every minute counts|3
奋不顾身|fèn bù gù shēn|dash forward regardless of danger|3
风调雨顺|fēng tiáo yǔ shùn|good weather|3
风和日丽|fēng hé rì lì|warm and sunny|3
风华正茂|fēng huá zhèng mào|in one's prime|2
风平浪静|fēng píng làng jìng|calm|4
风雨同舟|fēng yǔ tóng zhōu|in the same boat|3
风雨无阻|fēng yǔ wú zǔ|regardless of weather|4
风云人物|fēng yún rén wù|man of the hour|3
逢凶化吉|féng xiōng huà jí|turn bad luck into good|2
凤毛麟角|fèng máo lín jiǎo|rare as phoenix feathers|2
扶老携幼|fú lǎo xié yòu|help the old and young|2
浮想联翩|fú xiǎng lián piān|thoughts thronging|2
福如东海|fú rú dōng hǎi|fortune as vast as the eastern sea|2
覆水难收|fù shuǐ nán shōu|spilled water cannot be gathered|2
改过自新|gǎi guò zì xīn|turn over a new leaf|3
甘拜下风|gān bài xià fēng|admit defeat|2
感恩戴德|gǎn ēn dài dé|deeply grateful|2
刚柔并济|gāng róu bìng jì|combine strength and gentleness|2
高瞻远瞩|gāo zhān yuǎn zhǔ|look far ahead|3
高枕无忧|gāo zhěn wú yōu|sleep without worry|3
各奔前程|gè bēn qián chéng|each goes their own way|3
各显神通|gè xiǎn shén tōng|each shows their own skill|3
根深蒂固|gēn shēn dì gù|deep-rooted|3
公而忘私|gōng ér wàng sī|selfless|2
功成名就|gōng chéng míng jiù|achieve fame and success|3
功亏一篑|gōng kuī yī kuì|fail at the last hurdle|2
顾名思义|gù míng sī yì|as the name suggests|3
刮目相看|guā mù xiāng kàn|look at someone with new eyes|3
光彩夺目|guāng cǎi duó mù|dazzling|3
光明磊落|guāng míng lěi luò|open and honest|3
光阴似箭|guāng yīn sì jiàn|time flies|4
归心似箭|guī xīn sì jiàn|eager to return home|2
鬼斧神工|guǐ fǔ shén gōng|superb craftsmanship|2
国泰民安|guó tài mín ān|the country is peaceful and the people are secure|4
过河拆桥|guò hé chāi qiáo|burn one's bridges|2
海阔天空|hǎi kuò tiān kōng|boundless|4
海纳百川|hǎi nà bǎi chuān|all rivers run into the sea|3
害群之马|hài qún zhī mǎ|black sheep|3
邯郸学步|hán dān xué bù|imitate awkwardly|2
含辛茹苦|hán xīn rú kǔ|endure hardship|3
汗流浃背|hàn liú jiā bèi|sweat profusely|3
行云流水|xíng yún liú shuǐ|flowing style|3
好事多磨|hǎo shì duō mó|good things take time|3
和风细雨|hé fēng xì yǔ|gentle breeze and light rain|2
和睦相处|hé mù xiāng chǔ|live in harmony|3
河清海晏|hé qīng hǎi yàn|peaceful times|1
鹤立鸡群|hè lì jī qún|stand out from the crowd|3
后来居上|hòu lái jū shàng|latecomers surpass|3
厚积薄发|hòu jī bó fā|accumulate deeply and release slowly|2
花好月圆|huā hǎo yuè yuán|happy reunion|3
花团锦簇|huā tuán jǐn cù|rich clusters of flowers|2
画龙点睛|huà lóng diǎn jīng|add the finishing touch|3
画蛇添足|huà shé tiān zú|draw legs on a snake|2
化险为夷|huà xiǎn wéi yí|turn danger into safety|3
欢声笑语|huān shēng xiào yǔ|merry laughter|3
患得患失|huàn dé huàn shī|worry about personal gains and losses|2
焕然一新|huàn rán yī xīn|brand new|3
挥汗如雨|huī hàn rú yǔ|sweat like rain|3
回味无穷|huí wèi wú qióng|leave a lasting aftertaste|3
绘声绘色|huì shēng huì sè|vivid|3
浑然一体|hún rán yī tǐ|an integral whole|2
活蹦乱跳|huó bèng luàn tiào|bouncing with life|3
火上浇油|huǒ shàng jiāo yóu|add fuel to the fire|3
火烧眉毛|huǒ shāo méi máo|extremely urgent|3
饥不择食|jī bù zé shí|a hungry person is not picky|2
机不可失|jī bù kě shī|do not miss the chance|3
鸡飞蛋打|jī fēi dàn dǎ|lose everything|2
积少成多|jī shǎo chéng duō|many drops make a shower|3
吉星高照|jí xīng gāo zhào|lucky star shines|2
急中生智|jí zhōng shēng zhì|hit on a plan in a crisis|3
集思广益|jí sī guǎng yì|pool wisdom|3
家喻户晓|jiā yù hù xiǎo|known to all|3
坚持不懈|jiān chí bù xiè|persevere|4
坚强不屈|jiān qiáng bù qū|unyielding|3
艰苦朴素|jiān kǔ pǔ sù|hardworking and plain|2
见多识广|jiàn duō shí guǎng|experienced and knowledgeable|3
见义勇为|jiàn yì yǒng wéi|act courageously for justice|3
将心比心|jiāng xīn bǐ xīn|put oneself in another's shoes|3
交头接耳|jiāo tóu jiē ěr|whisper to each other|3
娇生惯养|jiāo shēng guàn yǎng|spoiled|2
脚踏实地|jiǎo tà shí dì|down-to-earth|4
接二连三|jiē èr lián sān|one after another|3
皆大欢喜|jiē dà huān xǐ|everyone is happy|3
节外生枝|jié wài shēng zhī|create complications|2
竭尽全力|jié jìn quán lì|spare no effort|3
金蝉脱壳|jīn chán tuō qiào|escape by cunning|2
金玉良言|jīn yù liáng yán|golden advice|2
锦上添花|jǐn shàng tiān huā|add flowers to brocade|3
锦囊妙计|jǐn náng miào jì|a clever plan|2
尽善尽美|jìn shàn jìn měi|perfect|3
精益求精|jīng yì qiú jīng|strive for perfection|3
井井有条|jǐng jǐng yǒu tiáo|in good order|3
敬而远之|jìng ér yuǎn zhī|keep at a respectful distance|2
九牛一毛|jiǔ niú yī máo|a drop in the ocean|3
久而久之|jiǔ ér jiǔ zhī|over time|3
举一反三|jǔ yī fǎn sān|draw inferences|3
聚精会神|jù jīng huì shén|concentrate|4
开门见山|kāi mén jiàn shān|come straight to the point|4
开天辟地|kāi tiān pì dì|since the beginning of the world|3
开卷有益|kāi juàn yǒu yì|reading is always beneficial|3
侃侃而谈|kǎn kǎn ér tán|speak confidently|2
刻骨铭心|kè gǔ míng xīn|engraved in one's heart|3
空前绝后|kōng qián jué hòu|unprecedented|3
苦尽甘来|kǔ jìn gān lái|after hardship comes sweetness|3
夸夸其谈|kuā kuā qí tán|boast|3
快马加鞭|kuài mǎ jiā biān|whip a fast horse|3
宽宏大量|kuān hóng dà liàng|magnanimous|3
来日方长|lái rì fāng cháng|there is plenty of time ahead|3
来之不易|lái zhī bù yì|hard-won|3
滥竽充数|làn yú chōng shù|be there just to make up the number|2
狼吞虎咽|láng tūn hǔ yàn|wolf down|3
劳逸结合|láo yì jié hé|balance work and rest|3
老马识途|lǎo mǎ shí tú|an old horse knows the way|2
乐极生悲|lè jí shēng bēi|extreme joy turns to sorrow|3
雷厉风行|léi lì fēng xíng|vigorous|3
礼尚往来|lǐ shàng wǎng lái|courtesy demands reciprocity|3
力不从心|lì bù cóng xīn|strength falls short of one's will|3
力争上游|lì zhēng shàng yóu|strive for the best|3
立竿见影|lì gān jiàn yǐng|get instant results|3
两全其美|liǎng quán qí měi|satisfy both sides|3
临危不惧|lín wēi bù jù|fearless in danger|3
灵机一动|líng jī yī dòng|have a sudden inspiration|2
流连忘返|liú lián wàng fǎn|linger and forget to return|2
柳暗花明|liǔ àn huā míng|a sudden ray of hope|2
龙飞凤舞|lóng fēi fèng wǔ|flamboyant calligraphy|2
龙争虎斗|lóng zhēng hǔ dòu|a fierce struggle|2
炉火纯青|lú huǒ chún qīng|reach perfection|2
屡见不鲜|lǚ jiàn bù xiān|common|2
马到成功|mǎ dào chéng gōng|immediate success|4
满载而归|mǎn zài ér guī|return fully loaded|3
慢条斯理|màn tiáo sī lǐ|leisurely|3
盲人摸象|máng rén mō xiàng|blind men feeling an elephant|2
毛遂自荐|máo suì zì jiàn|recommend oneself|2
眉飞色舞|méi fēi sè wǔ|beam with joy|3
美不胜收|měi bù shèng shōu|too many beautiful things to take in|2
门庭若市|mén tíng ruò shì|a busy doorway|2
梦寐以求|mèng mèi yǐ qiú|long for|3
面红耳赤|miàn hóng ěr chì|blush|3
妙笔生花|miào bǐ shēng huā|write beautifully|2
妙手回春|miào shǒu huí chūn|bring the dying back to life|2
名不虚传|míng bù xū chuán|live up to one's reputation|3
名副其实|míng fù qí shí|worthy of the name|3
名列前茅|míng liè qián máo|top of the list|3
名扬四海|míng yáng sì hǎi|famous worldwide|3
明日黄花|míng rì huáng huā|yesterday's news|2
铭心刻骨|míng xīn kè gǔ|engraved on one's heart|2
目瞪口呆|mù dèng kǒu dāi|dumbfounded|4
目中无人|mù zhōng wú rén|arrogant|3
南辕北辙|nán yuán běi zhé|go south by driving north|2
南来北往|nán lái běi wǎng|coming and going|2
能屈能伸|néng qū néng shēn|flexible|3
宁死不屈|nìng sǐ bù qū|rather die than yield|3
弄假成真|nòng jiǎ chéng zhēn|what was fake becomes real|2
怒发冲冠|nù fà chōng guān|bristle with anger|2
拍案叫绝|pāi àn jiào jué|slap the table in admiration|2
排山倒海|pái shān dǎo hǎi|overwhelming|3
旁若无人|páng ruò wú rén|self-absorbed|2
抛砖引玉|pāo zhuān yǐn yù|throw a brick to attract jade|2
鹏程万里|péng chéng wàn lǐ|a bright future|3
披星戴月|pī xīng dài yuè|work day and night|2
平分秋色|píng fēn qiū sè|share equally|2
平易近人|píng yì jìn rén|approachable|3
迫在眉睫|pò zài méi jié|urgent|3
七上八下|qī shàng bā xià|anxious|3
七嘴八舌|qī zuǐ bā shé|chattering|3
齐心协力|qí xīn xié lì|work together|4
其乐无穷|qí lè wú qióng|endless joy|3
奇花异草|qí huā yì cǎo|exotic flowers and plants|2
骑虎难下|qí hǔ nán xià|unable to back down|2
旗开得胜|qí kāi dé shèng|win at the first attempt|2
岂有此理|qǐ yǒu cǐ lǐ|outrageous|3
千变万化|qiān biàn wàn huà|ever-changing|4
千军万马|qiān jūn wàn mǎ|a mighty army|3
千钧一发|qiān jūn yī fà|a hairbreadth escape|3
千里迢迢|qiān lǐ tiáo tiáo|far away|3
千辛万苦|qiān xīn wàn kǔ|untold hardships|3
千言万语|qiān yán wàn yǔ|a thousand words|3
千载难逢|qiān zǎi nán féng|once in a blue moon|3
前赴后继|qián fù hòu jì|advance wave upon wave|3
前所未有|qián suǒ wèi yǒu|unprecedented|3
潜移默化|qián yí mò huà|influence imperceptibly|2
巧夺天工|qiǎo duó tiān gōng|superb craftsmanship|2
情不自禁|qíng bù zì jīn|cannot help oneself|3
情同手足|qíng tóng shǒu zú|as close as brothers|3
全神贯注|quán shén guàn zhù|concentrate|4
全力以赴|quán lì yǐ fù|go all out|4
任重道远|rèn zhòng dào yuǎn|a heavy responsibility and a long way|3
日新月异|rì xīn yuè yì|change rapidly|3
日积月累|rì jī yuè lěi|accumulate over time|3
如虎添翼|rú hǔ tiān yì|like a tiger with wings|3
如鱼得水|rú yú dé shuǐ|like a fish in water|3
如火如荼|rú huǒ rú tú|raging|2
三言两语|sān yán liǎng yǔ|in a few words|3
三顾茅庐|sān gù máo lú|make three calls at the thatched cottage|2
三思而行|sān sī ér xíng|think before you act|3
山清水秀|shān qīng shuǐ xiù|beautiful scenery|3
山穷水尽|shān qióng shuǐ jìn|at the end of one's rope|3
善始善终|shàn shǐ shàn zhōng|start and finish well|2
伤天害理|shāng tiān hài lǐ|heartless|2
深思熟虑|shēn sī shú lǜ|deliberate|3
神采奕奕|shén cǎi yì yì|glowing with health|2
生机勃勃|shēng jī bó bó|full of vitality|3
生死存亡|shēng sǐ cún wáng|life or death|3
十全十美|shí quán shí měi|perfect|4
石破天惊|shí pò tiān jīng|earth-shattering|2
实事求是|shí shì qiú shì|seek truth from facts|4
世外桃源|shì wài táo yuán|a hidden paradise|3
事半功倍|shì bàn gōng bèi|half the work, double the result|3
事倍功半|shì bèi gōng bàn|double the work, half the result|2
势如破竹|shì rú pò zhú|like splitting bamboo|2
守口如瓶|shǒu kǒu rú píng|tight-lipped|3
受宠若惊|shòu chǒng ruò jīng|overwhelmed by favor|2
书声琅琅|shū shēng láng láng|the sound of reading|2
熟能生巧|shú néng shēng qiǎo|practice makes perfect|3
水滴石穿|shuǐ dī shí chuān|water wears through stone|3
水落石出|shuǐ luò shí chū|the truth comes out|3
水到渠成|shuǐ dào qú chéng|success follows when conditions are ripe|3
顺其自然|shùn qí zì rán|let nature take its course|4
顺手牵羊|shùn shǒu qiān yáng|take advantage and steal|2
说一不二|shuō yī bù èr|mean what one says|3
司空见惯|sī kōng jiàn guàn|a common sight|3
四面八方|sì miàn bā fāng|all directions|4
四海为家|sì hǎi wéi jiā|make one's home everywhere|2
四通八达|sì tōng bā dá|accessible from all directions|3
随遇而安|suí yù ér ān|adapt to circumstances|2
损人利己|sǔn rén lì jǐ|harm others to benefit oneself|3
所向披靡|suǒ xiàng pī mǐ|invincible|2
贪小失大|tān xiǎo shī dà|penny wise, pound foolish|2
谈笑风生|tán xiào fēng shēng|talk cheerfully|2
堂堂正正|táng táng zhèng zhèng|upright|3
滔滔不绝|tāo tāo bù jué|flow on without stopping|3
特立独行|tè lì dú xíng|independent|3
提心吊胆|tí xīn diào dǎn|on tenterhooks|3
天长地久|tiān cháng dì jiǔ|enduring|3
天翻地覆|tiān fān dì fù|earth-shaking|3
天高地厚|tiān gāo dì hòu|the immensity of heaven and earth|2
天花乱坠|tiān huā luàn zhuì|a flood of eloquence|2
天经地义|tiān jīng dì yì|a matter of course|3
天南地北|tiān nán dì běi|far apart|2
天衣无缝|tiān yī wú fèng|flawless|3
天真烂漫|tiān zhēn làn màn|innocent|2
铁杵成针|tiě chǔ chéng zhēn|persistence turns iron into a needle|2
听天由命|tīng tiān yóu mìng|resign to fate|2
同甘共苦|tóng gān gòng kǔ|share joys and sorrows|3
同舟共济|tóng zhōu gòng jì|pull together in hard times|3
铜墙铁壁|tóng qiáng tiě bì|an impregnable fortress|2
痛定思痛|tòng dìng sī tòng|learn from painful experience|2
偷梁换柱|tōu liáng huàn zhù|secretly substitute|2
头头是道|tóu tóu shì dào|clear and logical|2
突飞猛进|tū fēi měng jìn|advance by leaps and bounds|3
图穷匕见|tú qióng bǐ xiàn|the truth is revealed at last|2
推陈出新|tuī chén chū xīn|bring forth the new through the old|3
推心置腹|tuī xīn zhì fù|open one's heart|2
脱口而出|tuō kǒu ér chū|blurt out|3
外强中干|wài qiáng zhōng gān|outwardly strong but inwardly weak|2
完美无缺|wán měi wú quē|flawless|3
万古长青|wàn gǔ cháng qīng|last forever|2
万紫千红|wàn zǐ qiān hóng|a blaze of color|3
万无一失|wàn wú yī shī|no room for error|3
万象更新|wàn xiàng gēng xīn|everything looks new|3
万众一心|wàn zhòng yī xīn|millions of people with one heart|3
亡命之徒|wáng mìng zhī tú|a desperado|2
望子成龙|wàng zǐ chéng lóng|hope one's child will succeed|3
望眼欲穿|wàng yǎn yù chuān|gaze anxiously|2
微不足道|wēi bù zú dào|insignificant|3
微乎其微|wēi hū qí wēi|very little|2
为所欲为|wéi suǒ yù wéi|do whatever one wants|3
惟妙惟肖|wéi miào wéi xiào|remarkably lifelike|2
温故知新|wēn gù zhī xīn|review the old to learn the new|3
稳如泰山|wěn rú tài shān|as steady as Mount Tai|2
问心无愧|wèn xīn wú kuì|have a clear conscience|2
无独有偶|wú dú yǒu ǒu|not alone in this|2
无精打采|wú jīng dǎ cǎi|listless|3
无中生有|wú zhōng shēng yǒu|create something out of nothing|3
无微不至|wú wēi bù zhì|meticulous|3
无边无际|wú biān wú jì|boundless|3
五光十色|wǔ guāng shí sè|colorful|3
五湖四海|wǔ hú sì hǎi|all corners of the land|3
五颜六色|wǔ yán liù sè|colorful|4
物美价廉|wù měi jià lián|good quality and low price|3
喜出望外|xǐ chū wàng wài|overjoyed|3
喜气洋洋|xǐ qì yáng yáng|full of joy|3
喜闻乐见|xǐ wén lè jiàn|loved by all|2
先见之明|xiān jiàn zhī míng|foresight|2
先来后到|xiān lái hòu dào|first come, first served|3
闲情逸致|xián qíng yì zhì|leisurely mood|2
相辅相成|xiāng fǔ xiāng chéng|complement each other|3
相得益彰|xiāng dé yì zhāng|bring out the best in each other|2
想方设法|xiǎng fāng shè fǎ|try every means|3
心花怒放|xīn huā nù fàng|burst with joy|3
心旷神怡|xīn kuàng shén yí|relaxed and happy|3
心平气和|xīn píng qì hé|calm|3
心心相印|xīn xīn xiāng yìn|have a mutual understanding|2
心悦诚服|xīn yuè chéng fú|sincerely admire|2
欣欣向荣|xīn xīn xiàng róng|thriving|3
新陈代谢|xīn chén dài xiè|the new replaces the old|3
信以为真|xìn yǐ wéi zhēn|take something as true|2
兴高采烈|xìng gāo cǎi liè|in high spirits|4
兴致勃勃|xìng zhì bó bó|full of interest|3
胸有成竹|xiōng yǒu chéng zhú|have a plan in mind|3
雄心壮志|xióng xīn zhuàng zhì|lofty ambitions|3
栩栩如生|xǔ xǔ rú shēng|lifelike|3
雪中送炭|xuě zhōng sòng tàn|send charcoal in snowy weather|3
循规蹈矩|xún guī dǎo jǔ|follow the rules|2
循序渐进|xún xù jiàn jìn|proceed step by step|3
雅俗共赏|yǎ sú gòng shǎng|appeal to both refined and popular tastes|2
眼疾手快|yǎn jí shǒu kuài|quick-eyed and quick-handed|2
扬眉吐气|yáng méi tǔ qì|feel proud and elated|3
洋洋得意|yáng yáng dé yì|smug|3
养精蓄锐|yǎng jīng xù ruì|conserve strength|2
摇摇欲坠|yáo yáo yù zhuì|tottering|2
一帆风顺|yī fān fēng shùn|smooth sailing|4
一举两得|yī jǔ liǎng dé|kill two birds with one stone|4
一目了然|yī mù liǎo rán|clear at a glance|3
一丝不苟|yī sī bù gǒu|meticulous|3
一团和气|yī tuán hé qì|harmonious|2
一望无际|yī wàng wú jì|boundless|3
一无所有|yī wú suǒ yǒu|have nothing|4
一五一十|yī wǔ yī shí|in full detail|3
一心一意|yī xīn yī yì|wholeheartedly|4
一言为定|yī yán wéi dìng|it is a deal|4
一意孤行|yī yì gū xíng|act willfully|3
一应俱全|yī yīng jù quán|complete in every respect|2
一鸣惊人|yī míng jīng rén|amaze with a single cry|3
一落千丈|yī luò qiān zhàng|fall sharply|3
一清二楚|yī qīng èr chǔ|crystal clear|3
一石二鸟|yī shí èr niǎo|kill two birds with one stone|3
一往无前|yī wǎng wú qián|press forward|3
一视同仁|yī shì tóng rén|treat everyone equally|3
依然如故|yī rán rú gù|as before|2
以德报怨|yǐ dé bào yuàn|repay evil with kindness|3
以身作则|yǐ shēn zuò zé|set an example|3
以逸待劳|yǐ yì dài láo|wait at ease for the tired enemy|2
义无反顾|yì wú fǎn gù|resolute|3
意气风发|yì qì fēng fā|high-spirited|3
意味深长|yì wèi shēn cháng|meaningful|3
因地制宜|yīn dì zhì yí|adapt to local conditions|3
因材施教|yīn cái shī jiào|teach according to aptitude|2
引人入胜|yǐn rén rù shèng|fascinating|3
饮水思源|yǐn shuǐ sī yuán|remember the source when drinking water|2
迎刃而解|yíng rèn ér jiě|solved easily|3
优胜劣汰|yōu shèng liè tài|survival of the fittest|2
优哉游哉|yōu zāi yóu zāi|leisurely|2
由浅入深|yóu qiǎn rù shēn|from the simple to the deep|2
有备无患|yǒu bèi wú huàn|preparedness averts peril|3
有口皆碑|yǒu kǒu jiē bēi|praised by all|2
有条不紊|yǒu tiáo bù wěn|orderly|3
有勇无谋|yǒu yǒng wú móu|brave but not wise|2
余音绕梁|yú yīn rào liáng|the music lingers|2
鱼贯而入|yú guàn ér rù|enter in single file|2
与人为善|yǔ rén wéi shàn|be kind to others|3
与日俱增|yǔ rì jù zēng|grow with each passing day|3
雨过天晴|yǔ guò tiān qíng|the sun comes out after rain|3
语重心长|yǔ zhòng xīn cháng|sincere and earnest|3
源远流长|yuán yuǎn liú cháng|long-standing and deep-rooted|3
远见卓识|yuǎn jiàn zhuó shí|foresight and insight|2
月下老人|yuè xià lǎo rén|the matchmaker|2
跃跃欲试|yuè yuè yù shì|eager to try|3
云开雾散|yún kāi wù sàn|the clouds part|2
运筹帷幄|yùn chóu wéi wò|plan strategies in the tent|2
再接再厉|zài jiē zài lì|keep up the good work|4
赞不绝口|zàn bù jué kǒu|praise endlessly|3
择善而从|zé shàn ér cóng|choose what is good and follow it|2
沾沾自喜|zhān zhān zì xǐ|smug|3
斩钉截铁|zhǎn dīng jié tiě|resolute|3
蒸蒸日上|zhēng zhēng rì shàng|flourishing|3
争先恐后|zhēng xiān kǒng hòu|vie to be first|3
知难而进|zhī nán ér jìn|advance despite difficulties|2
知足常乐|zhī zú cháng lè|contentment brings happiness|3
直截了当|zhí jié liǎo dàng|straightforward|3
志同道合|zhì tóng dào hé|like-minded|3
众所周知|zhòng suǒ zhōu zhī|as everyone knows|4
竹篮打水|zhú lán dǎ shuǐ|draw water with a bamboo basket|3
专心致志|zhuān xīn zhì zhì|concentrate|4
转危为安|zhuǎn wēi wéi ān|turn danger into safety|3
卓有成效|zhuó yǒu chéng xiào|fruitful|2
自食其力|zì shí qí lì|support oneself|3
自强不息|zì qiáng bù xī|constantly strive to become stronger|3
自由自在|zì yóu zì zài|free and easy|4
总而言之|zǒng ér yán zhī|in short|4
走马观花|zǒu mǎ guān huā|look at flowers on horseback|2
足智多谋|zú zhì duō móu|resourceful|3
爱才如命|ài cái rú mìng|love talent as one loves life|1
安如泰山|ān rú tài shān|as steady as Mount Tai|1
暗无天日|àn wú tiān rì|complete darkness|2
百尺竿头|bǎi chǐ gān tóu|make further progress|2
百读不厌|bǎi dú bù yàn|worth reading a hundred times|2
百无聊赖|bǎi wú liáo lài|bored|2
百依百顺|bǎi yī bǎi shùn|obedient in everything|2
半信半疑|bàn xìn bàn yí|half-believing|3
薄利多销|bó lì duō xiāo|small profits, quick turnover|2
保家卫国|bǎo jiā wèi guó|defend home and country|3
抱头鼠窜|bào tóu shǔ cuàn|scurry away|2
暴跳如雷|bào tiào rú léi|stamp with rage|2
悲喜交加|bēi xǐ jiāo jiā|mixed sorrow and joy|2
背井离乡|bèi jǐng lí xiāng|leave one's hometown|2
奔走相告|bēn zǒu xiāng gào|run around telling everyone|2
本末倒置|běn mò dào zhì|put the cart before the horse|2
笨嘴拙舌|bèn zuǐ zhuō shé|clumsy-tongued|2
逼上梁山|bī shàng liáng shān|be forced into rebellion|2
笔走龙蛇|bǐ zǒu lóng shé|vigorous calligraphy|1
必由之路|bì yóu zhī lù|the inevitable path|2
毕恭毕敬|bì gōng bì jìng|reverent|2
闭门造车|bì mén zào chē|act in isolation|2
避重就轻|bì zhòng jiù qīng|avoid the important and dwell on the trivial|2
鞭长莫及|biān cháng mò jí|beyond one's reach|2
变本加厉|biàn běn jiā lì|aggravate|2
别开生面|bié kāi shēng miàn|open up a new style|2
别有洞天|bié yǒu dòng tiān|a hidden world|2
冰冻三尺|bīng dòng sān chǐ|three feet of ice|2
兵不血刃|bīng bù xuè rèn|win without fighting|2
兵贵神速|bīng guì shén sù|speed is precious in war|2
波澜不惊|bō lán bù jīng|calm|2
博学多才|bó xué duō cái|learned and talented|2
不卑不亢|bù bēi bù kàng|neither humble nor arrogant|2
不即不离|bù jí bù lí|keep a certain distance|1
不进则退|bù jìn zé tuì|no progress means regression|2
不堪设想|bù kān shè xiǎng|unbearable to imagine|2
不可救药|bù kě jiù yào|incurable|2
不可一世|bù kě yī shì|arrogant|2
不露声色|bù lù shēng sè|show no emotion|2
不伦不类|bù lún bù lèi|neither fish nor fowl|2
不落窠臼|bù luò kē jiù|break new ground|1
不三不四|bù sān bù sì|dubious|2
不速之客|bù sù zhī kè|an uninvited guest|2
不同凡响|bù tóng fán xiǎng|extraordinary|2
不务正业|bù wù zhèng yè|not do one's proper work|2
不相上下|bù xiāng shàng xià|about equal|2
不翼而飞|bù yì ér fēi|vanish into thin air|2
不由自主|bù yóu zì zhǔ|involuntarily|3
不远万里|bù yuǎn wàn lǐ|travel far|2
谋财害命|móu cái hài mìng|murder for money|2
定国安邦|dìng guó ān bāng|bring peace to the country|1
足不出户|zú bù chū hù|stay indoors|2
命悬一线|mìng xuán yī xiàn|life hangs by a thread|2
意气用事|yì qì yòng shì|act on impulse|2
味同嚼蜡|wèi tóng jiáo là|tasteless like chewing wax|2
长驱直入|cháng qū zhí rù|drive straight in|2
入乡随俗|rù xiāng suí sú|do as the locals do|3
俗不可耐|sú bù kě nài|unbearably vulgar|1
耐人寻味|nài rén xún wèi|afford much food for thought|2
手到擒来|shǒu dào qín lái|easy to get|2
来者不拒|lái zhě bù jù|refuse nobody|2
拒之门外|jù zhī mén wài|shut someone out|2
外圆内方|wài yuán nèi fāng|soft outside and square inside|1
方寸大乱|fāng cùn dà luàn|greatly confused|2
乱七八糟|luàn qī bā zāo|in a mess|3
糟糠之妻|zāo kāng zhī qī|the wife who shared hardship|1
妻离子散|qī lí zǐ sàn|family broken apart|2
散兵游勇|sǎn bīng yóu yǒng|stragglers|1
勇往直前|yǒng wǎng zhí qián|forge ahead|3
前所未闻|qián suǒ wèi wén|never heard before|2
闻风而动|wén fēng ér dòng|act at once on hearing the news|2
动如脱兔|dòng rú tuō tù|move like a hare|1
兔死狐悲|tù sǐ hú bēi|the fox mourns the dead hare|2
悲天悯人|bēi tiān mǐn rén|pity the world|2
人定胜天|rén dìng shèng tiān|people can conquer nature|2
天伦之乐|tiān lún zhī lè|family happiness|2
乐在其中|lè zài qí zhōng|find joy in it|3
中流砥柱|zhōng liú dǐ zhù|a mainstay|2
海枯石烂|hǎi kū shí làn|till the sea runs dry|2
烂醉如泥|làn zuì rú ní|dead drunk|2
泥牛入海|ní niú rù hǎi|gone forever|2
红红火火|hóng hóng huǒ huǒ|prosperous|3
业精于勤|yè jīng yú qín|excellence comes from diligence|2
勤能补拙|qín néng bǔ zhuō|diligence makes up for clumsiness|3
料事如神|liào shì rú shén|foretell like a prophet|3
忙里偷闲|máng lǐ tōu xián|steal a moment of leisure|2
措手不及|cuò shǒu bù jí|caught unprepared|3
及时行乐|jí shí xíng lè|enjoy the present|3
色彩缤纷|sè cǎi bīn fēn|a riot of color|3
纷至沓来|fēn zhì tà lái|come in a continuous stream|2
怪力乱神|guài lì luàn shén|supernatural matters|1
二话不说|èr huà bù shuō|without a word|3
艺高人胆大|yì gāo rén dǎn dà|skill brings courage|3
静观其变|jìng guān qí biàn|wait and see|3
箭在弦上|jiàn zài xián shàng|an arrow on the bowstring|3
上善若水|shàng shàn ruò shuǐ|the highest good is like water|2
赴汤蹈火|fù tāng dǎo huǒ|go through fire and water|3
是非曲直|shì fēi qū zhí|right and wrong|3
烈火真金|liè huǒ zhēn jīn|true gold fears no fire|2
厉兵秣马|lì bīng mò mǎ|prepare for battle|2
在此一举|zài cǐ yī jǔ|hinge on this move|2
己所不欲勿施于人|jǐ suǒ bù yù wù shī yú rén|do not impose on others what you dislike|3
鸣锣开道|míng luó kāi dào|clear the way|2
胜利在望|shèng lì zài wàng|victory is in sight|3
合情合理|hé qíng hé lǐ|fair and reasonable|3
理直气壮|lǐ zhí qì zhuàng|confident with justice on one's side|3
壮志凌云|zhuàng zhì líng yún|soaring ambition|3
飞黄腾达|fēi huáng téng dá|rise rapidly|3
达官贵人|dá guān guì rén|high officials and nobles|2
格物致知|gé wù zhì zhī|study things to gain knowledge|2
阔别重逢|kuò bié chóng féng|reunion after a long separation|2
弱不禁风|ruò bù jīn fēng|too weak to stand the wind|3
索然无味|suǒ rán wú wèi|dull and tasteless|2
解甲归田|jiě jiǎ guī tián|return to civilian life|3
解囊相助|jiě náng xiāng zhù|help with money|2
助人为乐|zhù rén wéi lè|take pleasure in helping others|3
进退两难|jìn tuì liǎng nán|caught in a dilemma|3
难能可贵|nán néng kě guì|rare and commendable|3
穷则思变|qióng zé sī biàn|when exhausted, think of change|3
言而有信|yán ér yǒu xìn|keep one's word|3
死里逃生|sǐ lǐ táo shēng|escape death|3
息息相关|xī xī xiāng guān|closely linked|3
息事宁人|xī shì níng rén|calm things down|2
用兵如神|yòng bīng rú shén|command troops like a god|2
异想天开|yì xiǎng tiān kāi|have wild ideas|3
断章取义|duàn zhāng qǔ yì|quote out of context|3
形形色色|xíng xíng sè sè|of every description|3
重整旗鼓|chóng zhěng qí gǔ|regroup|3
重见天日|chóng jiàn tiān rì|see the light again|3
身强力壮|shēn qiáng lì zhuàng|strong and sturdy|3
济困扶危|jì kùn fú wēi|help those in danger and distress|2
危在旦夕|wēi zài dàn xī|in imminent danger|3
忧国忧民|yōu guó yōu mín|worry about country and people|3
民以食为天|mín yǐ shí wéi tiān|food is the first necessity|3
程门立雪|chéng mén lì xuě|wait in the snow for a teacher|3
通情达理|tōng qíng dá lǐ|reasonable|3
固执己见|gù zhí jǐ jiàn|stubbornly hold one's view|3
就事论事|jiù shì lùn shì|discuss the matter as it is|3
落井下石|luò jǐng xià shí|kick a person who has fallen|3
处变不惊|chǔ biàn bù jīng|stay calm in a crisis|3
惊天动地|jīng tiān dòng dì|earth-shaking|3
群策群力|qún cè qún lì|pool wisdom and effort|3
油然而生|yóu rán ér shēng|arise spontaneously|3
晓以大义|xiǎo yǐ dà yì|appeal to reason|2
耳目一新|ěr mù yī xīn|find everything fresh|3
量力而行|liàng lì ér xíng|act within one's means|3
游山玩水|yóu shān wán shuǐ|enjoy the scenery|3
求同存异|qiú tóng cún yì|seek common ground|3
赤子之心|chì zǐ zhī xīn|a pure heart|3
茅塞顿开|máo sè dùn kāi|suddenly see the light|3
伸张正义|shēn zhāng zhèng yì|uphold justice|2
绝处逢生|jué chù féng shēng|find a way out of an impasse|3
里应外合|lǐ yìng wài hé|act from inside and outside|3
继往开来|jì wǎng kāi lái|carry forward the past|3
秀外慧中|xiù wài huì zhōng|beautiful and clever|2
倍道兼行|bèi dào jiān xíng|travel at double speed|1
胆战心惊|dǎn zhàn xīn jīng|tremble with fear|3
至理名言|zhì lǐ míng yán|a wise saying|3
廉洁奉公|lián jié fèng gōng|honest and public-spirited|3
谢天谢地|xiè tiān xiè dì|thank heavens|3
气象万千|qì xiàng wàn qiān|magnificent|3
苟且偷安|gǒu qiě tōu ān|seek momentary ease|2
仁者见仁|rén zhě jiàn rén|the wise see wisdom|3
怨天尤人|yuàn tiān yóu rén|blame everyone but oneself|3
宜室宜家|yí shì yí jiā|make a happy home|1
拭目以待|shì mù yǐ dài|wait and see|3
口若悬河|kǒu ruò xuán hé|speak fluently|3
发扬光大|fā yáng guāng dà|carry forward and develop|4
人山人海|rén shān rén hǎi|a sea of people|4
命中注定|mìng zhōng zhù dìng|predestined|3
亡羊补牢|wáng yáng bǔ láo|mend the pen after losing sheep|3
牢不可破|láo bù kě pò|indestructible|3
破釜沉舟|pò fǔ chén zhōu|burn one's boats|3
才貌双全|cái mào shuāng quán|talented and good-looking|2
才子佳人|cái zǐ jiā rén|gifted scholars and beautiful ladies|2
斗转星移|dǒu zhuǎn xīng yí|the stars move and time passes|2
移花接木|yí huā jiē mù|stealthily substitute one thing for another|2
木已成舟|mù yǐ chéng zhōu|the wood is already a boat; too late to change|2
舟车劳顿|zhōu chē láo dùn|worn out by travel|2
顿开茅塞|dùn kāi máo sè|suddenly see the light|2
塞翁失马|sài wēng shī mǎ|the old man on the frontier loses his horse|3
博古通今|bó gǔ tōng jīn|learned in ancient and modern matters|2
今非昔比|jīn fēi xī bǐ|the present is not what it used to be|3
美中不足|měi zhōng bù zú|a blemish in an otherwise perfect thing|3
收放自如|shōu fàng zì rú|handle matters with ease|2
神采飞扬|shén cǎi fēi yáng|in high spirits|3
神通广大|shén tōng guǎng dà|infinitely powerful|3
妙不可言|miào bù kě yán|too wonderful for words|3
`;

const VALID_FREQ = new Set([1, 2, 3, 4, 5]);

function parse(): Idiom[] {
  const rows = RAW.trim().split(/\r?\n/);
  const seen = new Set<string>();
  const items: Idiom[] = [];
  for (const row of rows) {
    const [text, pinyin, gloss, freq] = row.split('|');
    if (!text || !pinyin || !gloss || !freq) throw new Error(`Bad dictionary row: ${row}`);
    if (seen.has(text)) throw new Error(`Duplicate idiom: ${text}`);
    const frequency = Number(freq);
    if (!VALID_FREQ.has(frequency)) throw new Error(`Bad frequency: ${row}`);
    seen.add(text);
    items.push({
      text,
      pinyin,
      gloss,
      frequency: frequency as Idiom['frequency'],
    });
  }
  return items;
}

export const IDIOMS: readonly Idiom[] = Object.freeze(parse());

export const IDIOM_BY_TEXT: ReadonlyMap<string, Idiom> = new Map(
  IDIOMS.map((idiom) => [idiom.text, idiom]),
);

const BY_FIRST_CHAR = new Map<string, Idiom[]>();
const BY_FIRST_SYLLABLE = new Map<string, Idiom[]>();
const BY_LAST_CHAR = new Map<string, Idiom[]>();

export function syllables(pinyin: string): string[] {
  return pinyin.trim().split(/\s+/);
}

/** Tone-insensitive comparison form used by homophone mode. */
export function bareSyllable(syllable: string): string {
  return syllable
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ü/g, 'v')
    .toLowerCase();
}

export function firstChar(idiom: Idiom): string {
  return idiom.text.charAt(0);
}

export function lastChar(idiom: Idiom): string {
  return idiom.text.charAt(idiom.text.length - 1);
}

export function firstSyllable(idiom: Idiom): string {
  return syllables(idiom.pinyin)[0] ?? '';
}

export function lastSyllable(idiom: Idiom): string {
  const parts = syllables(idiom.pinyin);
  return parts[parts.length - 1] ?? '';
}

export function firstSound(idiom: Idiom): string {
  return bareSyllable(firstSyllable(idiom));
}

export function lastSound(idiom: Idiom): string {
  return bareSyllable(lastSyllable(idiom));
}

function push(index: Map<string, Idiom[]>, key: string, idiom: Idiom): void {
  const list = index.get(key);
  if (list) list.push(idiom);
  else index.set(key, [idiom]);
}

for (const idiom of IDIOMS) {
  push(BY_FIRST_CHAR, firstChar(idiom), idiom);
  push(BY_FIRST_SYLLABLE, firstSound(idiom), idiom);
  push(BY_LAST_CHAR, lastChar(idiom), idiom);
}

export function findIdiom(text: string): Idiom | undefined {
  return IDIOM_BY_TEXT.get(text);
}

export function startsWithChar(char: string): readonly Idiom[] {
  return BY_FIRST_CHAR.get(char) ?? [];
}

export function startsWithSound(sound: string): readonly Idiom[] {
  return BY_FIRST_SYLLABLE.get(sound) ?? [];
}

export function endsWithChar(char: string): readonly Idiom[] {
  return BY_LAST_CHAR.get(char) ?? [];
}

export function isRare(idiom: Idiom): boolean {
  return idiom.frequency <= 2;
}

export function chainCandidates(
  previous: Idiom | null,
  homophone: boolean,
  used: ReadonlySet<string>,
): Idiom[] {
  if (!previous) return IDIOMS.filter((idiom) => !used.has(idiom.text));
  const pool = homophone
    ? startsWithSound(lastSound(previous))
    : startsWithChar(lastChar(previous));
  return pool.filter((idiom) => !used.has(idiom.text));
}

export function normalizeIdiom(raw: string): string {
  return raw
    .replace(/[\s\u3000]/g, '')
    .replace(/[，。！？、,.!?;；:：''""「」『』《》〈〉（）()【】\[\]…—-]/g, '')
    .trim();
}
