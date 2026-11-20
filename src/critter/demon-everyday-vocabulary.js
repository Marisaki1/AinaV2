'use strict';

// Append new groups at the end so published spellings remain stable.
// A group shares a stem, but each spelling decodes to its exact English form.
const groups = `
feel feels felt feeling feelings
like likes liked liking dislike dislikes disliked
word words wording
add adds added adding addition additional
use uses used using useful useless usage
im ive ill id
youre youve youll youd
shes its thats whats whos
dont doesnt didnt
cant couldnt wont wouldnt shouldnt
isnt arent wasnt werent
havent hasnt hadnt
lets let letting
theyre theyve theyll theyd
were weve well wed
myself yourself himself herself itself ourselves yourselves themselves
someone somebody anyone anybody everyone everybody nobody somebody
something anything everything nothing
another either neither none whatever wherever whenever however
really real reality realize realizes realized realizing
just simply basically nearly almost rather quite pretty
thing things stuff item items object objects
problem problems problematic
reason reasons reasonable
mean means meant meaning meanings
talk talks talked talking
watch watches watched watching
work works worked working worker workers
try tries tried trying
make makes made making maker
put puts putting
set sets setting settings
start starts started starting restart
finish finishes finished finishing
end ends ended ending endings
change changes changed changing
fix fixes fixed fixing
check checks checked checking
test tests tested testing
choose chooses chose chosen choosing choice choices
decide decides decided deciding decision decisions
plan plans planned planning
expect expects expected expecting
happen happens happened happening
allow allows allowed allowing
accept accepts accepted accepting
reject rejects rejected rejecting
agree agrees agreed agreeing agreement
move moves moved moving movement
go goes going gone
come comes came coming
get gets got gotten getting
take takes took taken taking
give gives gave given giving
bring brings brought bringing
stay stays stayed staying
stop stops stopped stopping
leave leaves left leaving
follow follows followed following follower followers
wait waits waited waiting
stand stands stood standing
sit sits sat sitting
hold holds held holding
carry carries carried carrying
drop drops dropped dropping
lift lifts lifted lifting
pull pulls pulled pulling
push pushes pushed pushing
open opens opened opening
close closes closed closing
turn turns turned turning
cut cuts cutting
break breaks broke broken breaking
build builds built building buildings
grow grows grew grown growing
fall falls fell fallen falling
rise rises rose risen rising
jump jumps jumped jumping
climb climbs climbed climbing climber climbers
fly flies flew flown flying flight
swim swims swam swum swimming
walk walks walked walking
run runs ran running runner runners
travel travels traveled travelling traveling traveler travelers
pass passes passed passing passage passages
reach reaches reached reaching
arrive arrives arrived arriving arrival
join joins joined joining
return returns returned returning
enter enters entered entering entrance
cross crosses crossed crossing
lead leads led leading
head heads headed heading
see sees saw seen seeing
hear hears heard hearing
listen listens listened listening
look looks looked looking
notice notices noticed noticing
spot spots spotted spotting
find finds finding
search searches searched searching
learn learns learned learning
teach teaches taught teaching teacher
study studies studied studying
read reads reading reader
write writes wrote written writing writer
draw draws drew drawn drawing drawings
copy copies copied copying
share shares shared sharing
show shows showed shown showing
tell tells told telling
say says said saying
speak speaks spoke spoken speaking speaker
ask asks asked asking
answer answers answered answering
call calls called calling
reply replies replied replying
message messages messaged messaging
explain explains explained explaining explanation
describe describes described describing description
name names named naming
spell spells spelled spelling
pronounce pronounces pronounced pronunciation
translate translates translated translating translation translations translator
convert converts converted converting converter conversion
decode decodes decoded decoding decoder
encode encodes encoded encoding encoder
type types typed typing
pronoun pronouns sentence sentences question questions
dictionary dictionaries glossary glossaries language languages dialect dialects vocabulary
common uncommon rare usual unusual ordinary normal typical simple
know knows knew known knowing knowledge
think thinks thought thinking thoughts
understand understands understood understanding
remember remembers remembered remembering memory memories
forget forgets forgot forgotten forgetting
guess guesses guessed guessing
believe believes believed believing belief
hope hopes hoped hoping
wish wishes wished wishing
want wants wanted wanting
need needs needed needing
prefer prefers preferred preferring
love loves loved loving
hate hates hated hating
trust trusts trusted trusting
doubt doubts doubted doubting
care cares cared caring
enjoy enjoys enjoyed enjoying
worry worries worried worrying
fear fears feared fearing
miss misses missed missing
mind minds minded minding
smile smiles smiled smiling
laugh laughs laughed laughing laughter
cry cries cried crying
shout shouts shouted shouting
whisper whispers whispered whispering
scream screams screamed screaming
sing sings sang sung singing song songs
sound sounds sounded sounding
smell smells smelled smelling
taste tastes tasted tasting
touch touches touched touching
sleep sleeps slept sleeping asleep
wake wakes woke woken waking awake
rest rests rested resting
eat eats ate eaten eating
drink drinks drank drunk drinking
cook cooks cooked cooking
wash washes washed washing
wear wears wore worn wearing
buy buys bought buying
sell sells sold selling
pay pays paid paying payment payments
cost costs costing
spend spends spent spending
save saves saved saving
steal steals stole stolen stealing thief thieves
borrow borrows borrowed borrowing
lend lends lent lending
count counts counted counting
measure measures measured measuring
pick picks picked picking
sort sorts sorted sorting
group groups grouped grouping
keep keeps kept keeping
lose loses losing loss
win wins won winning winner
fail fails failed failing failure
succeed succeeds succeeded succeeding success
help helps helped helping helpful helpless
hurt hurts hurting
heal heals healed healing healer healers
recover recovers recovered recovering recovery
die dies died dying
live lives lived living life
breathe breathes breathed breathing breath
hit hits hitting
attack attacks attacked attacking attacker attackers
defend defends defended defending defender defenders defense
fight fights fought fighting fighter fighters
kill kills killed killing killer
damage damages damaged damaging
protect protects protected protecting protection
guard guards guarded guarding
escape escapes escaped escaping
hide hides hid hidden hiding
chase chases chased chasing
capture captures captured capturing
release releases released releasing
imprison imprisons imprisoned imprisoning
bind binds bound boundless
tether tethers tethered tethering
cast casts casting caster casters
curse curses cursed cursing
bless blesses blessed blessing blessings
summon summons summoned summoning
banish banishes banished banishing
resist resists resisted resisting resistant
block blocks blocked blocking
dodge dodges dodged dodging
roll rolls rolled rolling roller
strike strikes struck striking
shoot shoots shot shooting
throw throws threw thrown throwing
aim aims aimed aiming
dice die
slash slashes slashed
pierce pierces pierced
burn burns burned burning
freeze freezes froze frozen freezing
melt melts melted melting
light lights lit lighting
dark darkness shadow shadows shade
bright brighter brightest dim dull
black white red green blue yellow orange purple gray grey brown pink violet crimson
color colors colored colorful
big bigger biggest little smaller smallest
long longer longest short shorter shortest
wide wider widest narrow
tall taller tallest high higher highest low lower lowest
deep deeper deepest shallow
fast faster fastest slow slower slowest
strong stronger strongest weak weaker weakest
good better best bad worse worst
easy easier easiest hard harder hardest
difficult difficulty tough rough smooth
clean cleaner cleanest dirty muddy wet dry damp
hot hotter hottest warm warmer cool cooler colder
soft softer heavy heavier lightest thick thin
full fuller emptier filled fill fills filling
safe safer safest dangerous deadly secret secrets
same different similar difference distinct unique
first second third fourth fifth sixth seventh eighth ninth tenth
eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million
half halves double triple quarter dozen pair pairs
today yesterday tomorrow tonight daytime midnight noon afternoon evening mornings
minute minutes second seconds hour hours day days week weeks month months year years
age ages aged young younger youngest oldest age
fresh ready early earlier late latest later recently
once twice sometimes often seldom usually rarely already still yet anymore
maybe perhaps probably certainly indeed especially exactly approximately
whether therefore though although despite even else otherwise
actually anyway anyways instead together apart separately
okay alright ok sure surely true truly false wrong correctly properly
indeed absolutely completely entirely fully partly slightly mostly
next previous former current final finally during since within toward towards against beyond across beside among along underneath above below
front back side sides middle center corner corners edge edges end
leftmost rightmost clockwise counterclockwise opposite nearby distance distances
forward backward backwards ahead straight away forth
outside indoors outdoors upstairs downstairs underground underwater overhead
always never whenever wherever nowhere somewhere anywhere everywhere
positive negative neutral friendly hostile angry sad happy calm nervous afraid scared tired hungry thirsty hurt
emotion emotions mood moods feeling
fun funny jokes joke joking serious seriously
goodness welcome greetings hey hi goodbye farewell
please thank thanking gratitude
pardon excuse excuses apology apologies
damn fucking fuck fucked shit shitty hell stupid
man men woman women boy boys girl girls adult adults baby babies
parent parents mom dad aunt uncle cousin cousins son sons daughter daughters
husband wife wives spouse partner partners
friend friends friendship close companion companions fellow fellows guest guests
enemy enemies rival rivals stranger strangers allies alliance
villager citizen citizens townsfolk farmer farmers merchant merchants
doctor doctors scribe scribes scholar scholars student students council
chief chiefs king kings queen queens lord lords lady ladies prince princess knight knights
captain captains soldier soldiers commander commanders battalion battalions squad squads
bandits archer archers scout scouts rider riders
wizard wizards sorcerer sorcerers warlock warlocks witch witches cleric clerics
paladin paladins druid druids ranger rangers rogue rogues barbarian barbarians monk monks bard bards
necromancers priest priests priestess priestesses
devil devils fiend fiends angel angels deity deities goddess goddesses
elf elves dwarf dwarves halfling halflings gnome gnomes tiefling tieflings aasimar
ogre ogres troll trolls kobold kobolds orc orcs goblins dragons
spider spiders rabbit rabbits crow crows wolf wolves fox foxes dog dogs cat cats
rat rats birds bird fish snake snakes horse horses beast beasts animal animals
yokai youkais tengu tengus tanuki kitsune jorogumo nurikabe yamabiko onibi
deer bear bears boar boars bat bats mouse mice insect insects
zombie zombies ghouls ghoul skeletons spirits ghosts vampire vampires
world worlds land lands realm realms plane planes
kingdom kingdoms empire empires region regions country countries
villages towns cities settlement settlements hamlet hamlets
mountains hills hill valleys valley forest forests grove groves
woods woodland clearing clearings trail trails path paths roads route routes
lake lakes rivers streams stream pond ponds swamp swamps marsh marshes
sea seas ocean oceans beach beaches shore shores island islands port ports harbor
cliff cliffs rock rocks stone stones boulder boulders
cavern caverns caves tunnel tunnels warren warrens den dens burrow burrows
shrine shrines temple temples hall halls palace palaces castle castles
towers floors doors gates walls rooms windows window roof roofs
stairs ladder ladders bridge bridges balcony balconies
camp camps shelter shelters home homes house houses
inn inns tavern taverns kitchen kitchens bed beds cellar cellars
shops markets library libraries archive archives academy academies
school schools classroom classrooms laboratory laboratories lab labs clinic clinics
forge forges farm farms field fields garden gardens
humanity species ancestry race races
quest quests task tasks objective objectives mission missions
reward rewards prize prizes treasure treasures chest chests
loot supplies supply gear equipment tool tools kit kits
backpack backpacks pack packs bag bags pouch pouches
currency coins copper platinum bronze metal iron steel wood leather cloth
golden silvered wooden glass paper parchment pages page ink quill
weapons swords blades blade daggers knives knife axes bows arrows bolts bolt
crossbow crossbows spear spears quarterstaff mace maul hammer hammers
shields armors breastplate helmet helmets boots gloves cloak cloaks mantle hood hoods
ring rings amulet amulets necklace necklaces pendant pendants
torch torches lantern lanterns candle candles firewood oil oils
potion potions vial vials bottle bottles poison poisons venom toxin antidote
flask flasks rations ration drink drinks soup bread rice fruit fruits
salt sugar meat cheese milk wine ale beer tea herbs medicine
woodcutter woodcutters seed seeds flower flowers plant plants roots root
bark branch branches leaf leafless reeds moss
hand hands finger fingers arm arms leg legs foot feet
eye eyes ear ears nose mouth teeth tooth tongue throat
hair face head skin chest shoulder shoulders heart brain
corpse skeleton skull flesh muscle muscles nerves nerve gut guts
pain wounds scars scar bruise bruises burn burns
damage healing hitpoints hp ac dc gp sp xp
ability abilities passive passives feature features trait traits
action actions reaction reactions bonus bonuses turn turns round rounds
combat encounter encounters initiative attack attacks defense damage critical
points point resource resources charge charges slot slots uses
level levels class classes subclass subclasses feat feats experience
die dice checks roll rolls rolls
modifier modifiers proficiency proficient expertise
resistances immunities immunity vulnerable condition conditions effects effect
paralyze paralysis petrification stunned stun poisoning bleed
charm charms charmed fear frightened blind blindness deaf deafness
concentrate concentrates concentrated concentrating concentration
duration durations instant instantly temporary temporarily permanent permanently
speed speeds distance feet range ranges ranged melee radius cone line lines
target targets targeted targeting area areas ally allies
acid fire cold ice lightning thunder poison radiant necrotic psychic force
bludgeoning piercing slashing elemental element elements
energy flame flames frost snow rain wind storm storms weather cloud clouds
spells spellcasting cantrip cantrips mage mages magical arcane divine
spellbook spellbooks scroll scrolls rituals ritual
illusion illusions disguise disguises disguised invisible invisibility
teleportation portal portals barrier barriers ward wards
necromancy necromantic resurrection resurrect resurrected revival revive revived
souls curse curses cursed cursed
blessing blessings vows vow oath oaths pact pacts
essence life death undead skeletons ghost ghosts
war wars battle battles siege sieges invasion peace truce
gather gathers gathered gathering collect collects collected collecting collection
deliver delivers delivered delivering delivery
send sends sent sending receive receives received receiving
report reports reported reporting document documents records record recorded
track tracks tracked tracking trail trails
explore explores explored exploring exploration
investigate investigates investigated investigating
discover discovers discovered discovering discovery
recognize recognizes recognized recognizing
identify identifies identified identifying
reveal reveals revealed revealing
cover covers covered covering
uncover uncovers uncovered uncovering
appear appears appeared appearing appearance
disappear disappears disappeared disappearing
rise raises raised raising
open opens opening opened
unlock unlocks unlocked unlocking
lock locks locked locking
seal seals sealed sealing
restore restores restored restoring restoration
remove removes removed removing removal
replace replaces replaced replacing replacement
combine combines combined combining
separate separates separated separating
split splits splitting
connect connects connected connecting connection
create creates created creating creation creature creatures
destroy destroys destroyed destroying destruction
invent invents invented inventing invention
design designs designed designing
edit edits edited editing editor
update updates updated updating
expand expands expanded expanding
include includes included including
exclude excludes excluded excluding
support supports supported supporting
preserve preserves preserved preserving
match matches matched matching
repeat repeats repeated repeating
continue continues continued continuing
increase increases increased increasing
reduce reduces reduced reducing reduction
improve improves improved improving improvement
avoid avoids avoided avoiding
prevent prevents prevented preventing
require requires required requiring
control controls controlled controlling
serve serves served serving service
obey obeys obeyed obeying
order orders ordered ordering
command commands commanded commanding
warn warns warned warning
threaten threatens threatened threatening threat threats
offer offers offered offering
refuse refuses refused refusing
promise promises promised promising
hide hides hiding hidden
forbid forbids forbade forbidden forbidding
permit permits permitted permitting permission
betray betrays betrayed betraying betrayal
reveal secret truth evidence clue clues
copy original version versions template templates
button buttons click clicks clicked clicking
list lists listed listing
number numbers numbered numbering
value values valuing amount amounts quantity quantities
data text file files folder folders library
local locally offline online network
source sources result results outcome outcomes
example examples input outputs output
line lines spaces space newline punctuation letter letters
case lowercase uppercase caps capital
format formats formatted formatting
table tables row rows column columns
time times moment moments
choose chose selection select selects selected selecting
search filter filters filtered filtering
player players dungeonmaster campaign campaigns session sessions story stories plot plots
character characters npc npcs monsters
roll damage attack heal ability save check movement

so am an oh way ways might indeed darn
ah yeah huh yep nope hmm uh um ow oi ugh wow oops shh
nod nods nodded nodding bow bows bowed bowing
begin begins began begun beginning
guy guys gal gals lad lads kid kids
dash dashes dashed dashing
seem seems seemed seeming
mask masks masked masking
place places placed placing
mushroom mushrooms shroom shrooms
member members membership
information info inform informs informed informing
ground grounds grounded grounding
sir madam ma'am mister auntie
boss bosses
doing done undo undoes undone undoing
wave waves waved waving
fine finer finest
hero heroic heroism heroes
commission commissions commissioned commissioning
deal deals dealt dealing
off into onto upon per via
inspiration inspired inspire inspiring
gonna wanna gotta sorta kinda cuz tho
sigh sighs sighed sighing
bucket buckets
unidentified
pocket pockets pocketed pocketing
ones most such lot lots part parts
fairy fairies faerie faeries
note notes noted
sovereign sovereigns
phone phones
cannot
reset resets resetting
great greater greatest
interested interesting interest interests
total totals
unprone
further farther furthest farthest
luck lucky luckily unlucky
church churches
bit bits
reckless recklessly
own owns owned owning owner ownership
special especially
attunement attune attuned
guardian guardians
thug thugs cult cults cultist cultists
others immediately extra least
mark marks marked marking
job jobs visit visits visited visiting
able unable
request requests requested requesting
location locations
bell bells
direction directions
currently
recall recalls recalled recalling
soil soils ore ores
worth worthwhile worthless
top tops bottom bottoms
font fonts enhance enhances enhanced enhancing
money
managed manages managing management
nice nicer nicest
outskirt outskirts
stall stalls
kind kinds kindly kindness
innate
jewelry jewellery jewel jewels jewelries jeweler
weird weirder weirdest strange stranger strangest
random randomly
defeat defeats defeated defeating
pill pills
incoming outgoing
due unless
female male
mention mentions mentioned mentioning
single
base bases based basing basis
drake drakes
ago
bardic
crit crits
ever
approach approaches approached approaching
hallway hallways corridor corridors
direct directly indirect indirectly
rage rages raging raged
matter matters
met meeting meetings
tilt tilts tilted tilting
possible impossible
play plays played playing
proceed proceeds proceeded proceeding
humanoid humanoids
idea ideas
teleport teleported teleports teleporting
quality qualities
beat beats beaten beating
prepare prepares prepared preparing preparation
shrug shrugs shrugged shrugging
whole
swap swaps swapped swapping
clear clears cleared clearing
sense senses sensed sensing
square squares squared
glow glows glowed glowing
familiar familiars unfamiliar
stuffs remaining teams
afterwards afterward suddenly
giant giants huge gigantic
consume consumes consumed consuming
voice voices voiced voicing
power powers powerful powerless
sickle sickles
cough coughs coughed coughing
various
step steps stepped stepping
lamprey lampreys
cart carts wagon wagons
clothes clothing
plank planks
orb orbs
trouble troubles troubled troubling
hunter hunters hunt hunts hunted hunting
chance chances
aura auras
legendary
rescue rescues rescued rescuing
shake shakes shook shaking
couple couples
sorcery
course courses
figure figures figured figuring
curious curiosity
complete completes completed completing completion
form forms formed forming
pat pats patted patting
tank tanks
bye
yours ours theirs hers
wonder wonders wondered wondering
willing unwilling willingly
books
grab grabs grabbed grabbing
slip slips slipped slipping
additionally
haired
vault vaults
haste hasted
conversation conversations
become becomes became becoming
handle handles handled handling
compass compasses
unknown
rally rallies rallied rallying
bite bites bitten biting
cauldron cauldrons
shall
counter counters countered countering
likely unlikely
sight
sniff sniffs sniffed sniffing
medicinal
uncanny
locate locates located locating
position positions positioned positioning
grapple grapples grappled grappling
except exception exceptions
situation situations
attempt attempts attempted attempting
eventually
guarantee guarantees guaranteed guaranteeing
vision visions
stare stares stared staring
multiple
maid maids
mirror mirrors mirrored mirroring
smoke smokes smoked smoking
successful successfully
busy busier busiest
bother bothers bothered bothering
size sizes
holy unholy
plate plates
sneak sneaks sneaked snuck sneaking
suppose supposes supposed supposing
store stores stored storing
regular regularly
available availability
sign signs signed signing
sale sales
plus minus
attention
related relates relating relation relationship relationships
pour pours poured pouring
news
immune
i'm i've i'll i'd
you're you've you'll you'd
he's he'll he'd she's she'll she'd it's it'll
we're we've we'll we'd they're they've they'll they'd
that's what's where's who's how's there's here's let's
don't doesn't didn't can't couldn't won't wouldn't shouldn't
isn't aren't wasn't weren't haven't hasn't hadn't mustn't
having being
closer closest
manage manages managed managing
theres heres alot bout dunno
aw aww eh ahh ahhh ohh ohhh hehe haha hahaha hmmm woah
versus
mining mines mined miner miners
exchange exchanges exchanged exchanging
normally main mainly important importance
customer customers seller sellers buyer buyers
option options optional
persuade persuades persuaded persuading
emanation emanations
bomb bombs explosive explosives blast blasts blasted blasting
status statuses reliable unreliable surrounding surroundings
shovel shovels jar jars pot pots bowl bowls plate plates
self somehow somewhat sudden
clap claps clapped clapping
knock knocks knocked knocking
disengage disengages disengaged disengaging
obelisk obelisks trapped
flail flails gun guns cannon cannons
business businesses
confirm confirms confirmed confirming confirmation
swift swiftly chicken chickens
performance perform performs performed performing performer performers
fact facts factual
inspect inspects inspected inspecting inspection
suggest suggests suggested suggesting suggestion suggestions
greatsword greatswords longsword longswords shortsword shortswords
herbalist herbalists mastery masteries
easily mist misty fog foggy
distract distracts distracted distracting distraction distractions
digitally digital device devices
till training train trains trained
opportunity opportunities
ignore ignores ignored ignoring
comment comments commented commenting
crypt crypts coffin coffins cemetery cemeteries graveyard graveyards
sanctuary sanctuaries chamber chambers passageway passageways
recharge recharges recharged recharging
dash disengage shove shoves shoved shoving pushback
wis dex con cha int str
adv dis crits dmg atk init temp
guilds leader leaders clan clans faction factions
rift rifts shard shards fragments fragment crystal crystals
season seasons autumn winter spring summer
blessing curse corruption corrupt corrupted corrupts
memory amnesia illusionary illusory canopy thicket
lanterns crossroads maze labyrinth
herbal medicine antidote alchemy alchemist
vines vine leaves foliage
`;

const openings = 'za ve dha sho em gu khra ir ja zho kel lu maz en oro fe qha re shi thu ul vi wes xa yu zhe'.split(' ');
const endings = 'var zek vul ram tel naz khar zor zel nen mazh ves rath dar shen kav vel nur zhar ran rek lor dak zah veth mar zed kul rav fer nes drel wyr mor zal'.split(' ');
const forms = ['', 'a', 'en', 'ath', 'ir', 'esh', 'ak', 'an', 'or', 'eth', 'av', 'ek', 'az', 'ar', 'in', 'el', 'al'];
const finalSounds = ['sk', 'th', 'sh', 'v', 'q', 't', 'x'];

module.exports = groups.trim().split('\n').flatMap((line, index) => {
  if (!line.trim()) return [];
  const opening = openings[index % openings.length];
  const ending = endings[Math.floor(index / openings.length)];
  if (!ending) throw new Error('Add another Demon Language stem ending.');
  return line.trim().split(/\s+/).flatMap((word, position) => {
    const form = forms[position % forms.length] + (position >= forms.length ? 'ev' + forms[Math.floor(position / forms.length)] : '');
    const stem = opening + ending + form;
    // These endings can't finish a word generated by the default syllable cipher.
    const endingSound = finalSounds[index % finalSounds.length];
    return word.includes("'") ? [[word, stem + endingSound], [word.replaceAll("'", '’'), stem + 'y' + endingSound]]
      : [[word, stem + endingSound]];
  });
});
