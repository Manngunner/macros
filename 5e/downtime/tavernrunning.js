/* global Roll, game, ui, ChatMessage, Dialog */
/*
A macro for working out the passive income for a temple.
Things to add:
 - Disadvantage on rolls if players manages and works
 - Upkeep
   - Manager impact on upkeep
   - User changeable
*/
// All the variables to change
let markupMod;
const defaultDrinkCost = 5; // 5cp
const patronCapacity = 50;
const maxPopularitySwing = 0.05;
const [runningCostLower, runningCostUpper] = [120, 420];
const currentTime = Math.round(game.time.worldTime / 86400);
const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const user = game.user;
if (user.character == null) {
  ui.notifications.error("You have no selected character");
  process.exit(1);
}
const userId = user.character.id;
// Get player roll bonuses
const playerCharacter = user.character.getRollData();
const pcInt = playerCharacter.abilities.int.mod;
const pcWis = playerCharacter.abilities.wis.mod;
const pcPer = playerCharacter.skills.per.mod;
const pcPrf = playerCharacter.skills.prf.mod;
// Get manager roll bonuses
const managerId = "TudZHgChBklhItle";
const manager = game.actors.get(managerId);
const managerCharacter = manager.getRollData();
const manInt = managerCharacter.abilities.int.mod;
const manWis = managerCharacter.abilities.wis.mod;
// Get persistent flags
let [
  currentPopularity,
  lastRan,
  managerBonus,
  workerBonus,
  manCheckbox,
  wkrCheckbox,
  markupDefault,
  localWealth,
] = await getFlags(userId);
if (currentTime == lastRan) {
  ui.notifications.error("Please wait at least a day to run again");
  process.exit(2);
}
const chatMessage = `
<p>Running cost: ${runningCostLower / 100}gp</p>
<p>Popularity: ${currentPopularity.toLocaleString("en", {
  style: "percent",
})}</p>
<p>Last ran: ${currentTime - lastRan} days ago</p>
`;
const dialogContent = `
<form>
  <div class="form-group">
    <label for="pc-managed">Player Managed?</label>
    <input id="pc-managed" type="checkbox" name="pc-managed" ${manCheckbox}>
    <label for="pc-worked">Player Worked?</label>
    <input id="pc-worked" type="checkbox" name="pc-worked" ${wkrCheckbox}>
  </div>
  <div class="form-group">
    <label>Markup:</label>
    <select id="markup" name="markup">
      <option value="5">5%</option>
      <option value="10">10%</option>
      <option value="20">20%</option>
      <option value="50">50%</option>
      <option value="100">100%</option>
      <option value="200">200%</option>
    </select>
  </div>
  <details closed="Test">
  <h3>General stats</h3>
  <div class="form-group">
    <label for="manager-bonus">Manager Bonus</label>
    <input id="manager-bonus" type="number" name="manager-bonus" value=${managerBonus}>
  </div>
  <div class="form-group">
    <label for="worker-bonus">Worker Bonus</label>
    <input id="worker-bonus" type="number" name="worker-bonus" value=${workerBonus}>
  </div>
  <div class="form-group">
    <label for="local-wealth">Local Wealth</label>
    <input id="local-wealth" type="number" step="0.01" min=0 name="local-wealth" value=${localWealth}>
  </div>
  <ul style="list-style-type:none;">
    <li>General upkeep: ${runningCostLower / 100}-${runningCostUpper / 100}gp
    <li>Max Patrons: ${patronCapacity}</li>
    <li>Popularity: ${new Intl.NumberFormat("default", {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(currentPopularity)}</li>
  </ul>
  </details>
</form>
`;
function dndfyMoney(amount) {
  let money;
  let negative = false;
  // Find a negative
  if (amount.toString().startsWith("-")) {
    amount = Math.abs(amount);
    negative = true;
  }
  if (amount.toString().length == 1) {
    money = `${amount}cp`;
  } else if (amount.toString().length == 2) {
    money = `${amount.toString().slice(0, 1)}sp, ${amount
      .toString()
      .slice(-1)}cp`;
  } else if (amount.toString().length == 3) {
    money = `${amount.toString().slice(0, 1)}gp, ${amount
      .toString()
      .slice(-2, -1)}sp, ${amount.toString().slice(-1)}cp`;
  } else {
    money = `${amount.toString().slice(0, -3)}pp, ${amount
      .toString()
      .slice(-3, -2)}gp, ${amount.toString().slice(-2, -1)}sp, ${amount
      .toString()
      .slice(-1)}cp`;
  }
  if (negative == true) {
    money = "-" + money;
    return money;
  } else {
    return money;
  }
}

async function popularity_calculation(pcWorked) {
  // Popularity
  let persuasionRoll, performanceRoll;
  if (pcWorked == true) {
    persuasionRoll = await new Roll(`1d20+${pcPer}+${workerBonus}`).evaluate({
      async: true,
    });
    performanceRoll = await new Roll(`1d20+${pcPrf}+${workerBonus}`).evaluate({
      async: true,
    });
  } else {
    persuasionRoll = await new Roll(`1d20+${workerBonus}`).evaluate({
      async: true,
    });
    performanceRoll = await new Roll(`1d20+${workerBonus}`).evaluate({
      async: true,
    });
  }
  const rollAverage = average([persuasionRoll.total, performanceRoll.total]);
  if (rollAverage < 5) {
    return -Math.abs(maxPopularitySwing) * 1;
  } else if (rollAverage >= 5 && rollAverage < 11) {
    return -Math.abs(maxPopularitySwing) * 0.5;
  } else if (rollAverage >= 11 && rollAverage < 16) {
    return 0;
  } else if (rollAverage >= 16 && rollAverage < 21) {
    return maxPopularitySwing * 0.5;
  } else if (rollAverage >= 21 && rollAverage < 26) {
    return maxPopularitySwing * 0.75;
  } else if (rollAverage >= 26) {
    return maxPopularitySwing * 1;
  }
}

async function patron_calculation(pcWorked) {
  // Patrons and drinks
  let persuasionRoll, performanceRoll;
  if (pcWorked == true) {
    persuasionRoll = await new Roll(`1d20+${pcPer}+${workerBonus}`).evaluate({
      async: true,
    });
    performanceRoll = await new Roll(`1d20+${pcPrf}+${workerBonus}`).evaluate({
      async: true,
    });
  } else {
    persuasionRoll = await new Roll(`1d20+${workerBonus}`).evaluate({
      async: true,
    });
    performanceRoll = await new Roll(`1d20+${workerBonus}`).evaluate({
      async: true,
    });
  }
  let patronNumbers = Math.floor(
    patronCapacity *
      currentPopularity *
      ((average([persuasionRoll.total, performanceRoll.total]) + markupMod) /
        10)
  );
  // Can't go below 0
  patronNumbers = patronNumbers < 0 ? 0 : patronNumbers;
  let drinksBought = 0;
  while (patronNumbers > 999) {
    let roll = await new Roll(`999d4`).evaluate({
      async: true,
    });
    drinksBought = drinksBought + roll.total;
    patronNumbers = patronNumbers - 999;
  }
  let roll = await new Roll(`${patronNumbers}d4`).evaluate({
    async: true,
  });
  drinksBought = drinksBought + roll.total;
  return [patronNumbers, drinksBought];
}

async function profit_calculation(pcManaged, markup) {
  // Cost and income
  let intelligenceRoll, wisdomRoll;
  if (pcManaged == true) {
    intelligenceRoll = await new Roll(`1d20+${pcInt}`).evaluate({
      async: true,
    });
    wisdomRoll = await new Roll(`1d20+${pcWis}`).evaluate({
      async: true,
    });
  } else {
    intelligenceRoll = await new Roll(`1d20+${manInt}`).evaluate({
      async: true,
    });
    wisdomRoll = await new Roll(`1d20+${manWis}`).evaluate({
      async: true,
    });
  }
  let drinkCost = Math.round(
    (defaultDrinkCost * localWealth) /
      ((average([intelligenceRoll.total, wisdomRoll.total]) + managerBonus) /
        10)
  );
  let drinkPrice = Math.round(
    defaultDrinkCost *
      localWealth *
      (average([intelligenceRoll.total, wisdomRoll.total]) / 10) *
      (markup / 100 + 1)
  );
  return [drinkCost, drinkPrice];
}

async function main(pcManaged, pcWorked, markup) {
  let drinksBought = 0;
  let totalCost = 0;
  let totalIncome = 0;
  let newPopularity = 0;
  var totalPatrons = [];
  for (let i = 0; i < currentTime - lastRan; i++) {
    // Patrons and drinks
    const [patrons, drinks] = await patron_calculation(pcWorked, markup);
    totalPatrons.push(patrons);
    drinksBought = drinksBought + drinks;
    // Cost and income
    const [cost, income] = await profit_calculation(pcManaged, markup);
    totalCost = totalCost + cost * drinks;
    totalIncome = totalIncome + income * drinks;
    // Popularity modification
    newPopularity = await popularity_calculation(pcManaged);
    currentPopularity = currentPopularity + newPopularity;
  }
  let cost = dndfyMoney(totalCost);
  let income = dndfyMoney(totalIncome);
  let profit = dndfyMoney(totalIncome - totalCost);
  const messageAddition = `
  <p>Drinks bought: ${drinksBought}</p>
  <p>Average patrons: ${average(totalPatrons)}</p>
  <p>Drink cost: ${cost}</p>
  <p>Drink income: ${income}</p>
  <p>Drink profit: ${profit}</p>
`;
  await setFlags(userId, {
    popularity: currentPopularity,
    lastRan: currentTime,
    managerBonus: managerBonus,
    workerBonus: workerBonus,
    manCheckbox: manCheckbox,
    wkrCheckbox: wkrCheckbox,
    markupDefault: markupDefault,
    localWealth: localWealth,
  });
  ChatMessage.create({
    content: chatMessage.concat("\r", messageAddition),
    speaker: ChatMessage.getSpeaker(),
  });
}

async function getFlags(id) {
  if (user.getFlag("world", `tavern-${id}`) == null) {
    await user.setFlag("world", `tavern-${id}`, {
      popularity: 0.1,
      lastRan: currentTime,
      managerBonus: 0,
      workerBonus: 0,
      manCheckbox: "",
      wkrCheckbox: "",
      markupDefault: 5,
      localWealth: 0.2,
    });
    ui.notifications.info("Macro initialised");
    process.exit(0);
  }
  const pop = await user.getFlag("world", `tavern-${id}`).popularity;
  const lr = await user.getFlag("world", `tavern-${id}`).lastRan;
  const mb = await user.getFlag("world", `tavern-${id}`).managerBonus;
  const wb = await user.getFlag("world", `tavern-${id}`).workerBonus;
  const mcb = await user.getFlag("world", `tavern-${id}`).manCheckbox;
  const wcb = await user.getFlag("world", `tavern-${id}`).wkrCheckbox;
  const mkup = await user.getFlag("world", `tavern-${id}`).markupDefault;
  const lw = await user.getFlag("world", `tavern-${id}`).localWealth;
  return [pop, lr, mb, wb, mcb, wcb, mkup, lw];
}

async function setFlags(id, kwargs) {
  for (const key in kwargs) {
    await user.setFlag("world", `tavern-${id}`, {
      [`${key}`]: kwargs[key],
    });
  }
}

async function grabinput(html) {
  // Yoink the input field
  const pcManaged = html.find('input[name="pc-managed"]:checked');
  const pcWorked = html.find('input[name="pc-worked"]:checked');
  managerBonus = Number(html.find('input[name="manager-bonus"]')[0].value);
  workerBonus = Number(html.find('input[name="worker-bonus"]')[0].value);
  const markup = Number(html.find('[name="markup"]')[0].value);
  localWealth = parseFloat(html.find('[name="local-wealth"]')[0].value);
  // Make sure the result is not empty
  let pcMan = false;
  let pcWk = false;
  if (pcManaged.val() === "on") {
    pcMan = true;
    manCheckbox = "checked";
  } else {
    manCheckbox = "";
  }
  if (pcWorked.val() === "on") {
    pcWk = true;
    wkrCheckbox = "checked";
  } else {
    wkrCheckbox = "";
  }
  switch (markup) {
    case 5:
      markupMod = 1;
      markupDefault = 5;
      break;
    case 10:
      markupDefault = 10;
      break;
    case 20:
      markupMod = -1;
      markupDefault = 20;
      break;
    case 50:
      markupMod = -3;
      markupDefault = 50;
      break;
    case 100:
      markupMod = -5;
      markupDefault = 100;
      break;
    case 200:
      markupMod = -10;
      markupDefault = 200;
      break;
  }
  main(pcMan, pcWk, markup);
}

new Dialog({
  title: "Enter number of days",
  content: dialogContent.replace(
    `>${markupDefault}%`,
    `selected>${markupDefault}%`
  ),
  buttons: {
    apply: {
      // Shove the resulting html into the function
      callback: (html) => grabinput(html),
      icon: '<i class="fa-thin fa-timer"></i>',
      label: "Downtime!",
      padding: "15px 32px",
      margin: "4px 2px",
    },
  },
}).render(true);
