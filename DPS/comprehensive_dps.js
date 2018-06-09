/* Comprehensive_DPS.js */

var Table = null;
var colHeaders = ["Pokemon", "Fast Move", "Charged Move", "DPS", "TDO", "DPS*TDO", "CP"];

var DEFAULT_LEVEL = 40;
var DEFAULT_IVs = [15, 15, 15];
var DEFAULT_ENEMY_CURRENT_DEFENSE = 160;
var DEFAULT_ENEMY_POKETYPE1 = 'none';
var DEFAULT_ENEMY_POKETYPE2 = 'none';
var DEFAULT_WEATHER = 'EXTREME';

var ConfigurableAttributes = [
	{'elementId': "ui-species_d", 'qsField': "pkm", 'defaultValue': '', 'iconGetter': getPokemonIcon, 'database': "POKEMON_SPECIES_DATA"}, 
	{'elementId': "d-pokeType1", 'qsField': "type1", 'defaultValue': DEFAULT_ENEMY_POKETYPE1}, 
	{'elementId': "d-pokeType2", 'qsField': "type2", 'defaultValue': DEFAULT_ENEMY_POKETYPE2}, 
	{'elementId': "fmove_d", 'qsField': "fm", 'defaultValue': '', 'iconGetter': getTypeIcon, 'database': "FAST_MOVE_DATA"}, 
	{'elementId': "cmove_d", 'qsField': "cm", 'defaultValue': '', 'iconGetter': getTypeIcon, 'database': "CHARGED_MOVE_DATA"}, 
	{'elementId': "weather", 'qsField': "wt", 'defaultValue': DEFAULT_WEATHER}, 
	{'elementId': "searchInput", 'qsField': "qs", 'defaultValue': ''},
	{'qsField': "by", defaultValue: "DPS"},
	{'qsField': "order", defaultValue: "desc"},
];

var Context = {
	weather: DEFAULT_WEATHER,
	enemy: {},
	generic_enemy_bool: false
};

var ALL_COMBINATIONS = [];


Pokemon.prototype.calc_DPS = function(x, y){
	// x is the energy left; y is the enemy DPS
	var FDmg = damage2(this, Context.enemy, this.fmove, Context.weather);
	var CDmg = damage2(this, Context.enemy, this.cmove, Context.weather);
	var FDur = this.fmove.duration/1000;
	var CDur = this.cmove.duration/1000;
	var CDWS = this.cmove.dws/1000;
	var FE = this.fmove.energyDelta;
	var CE = -this.cmove.energyDelta;
	
	if (CE >= 100){
		CE = CE + 0.5 * FE + 0.5 * y * CDWS;
	}
	
	var FDPS = FDmg/FDur;
	var FEPS = FE/FDur;
	var CDPS = CDmg/CDur;
	var CEPS = CE/CDur;
	
	this.st = this.Stm / y;
	this.dps = (FDPS * CEPS + CDPS * FEPS)/(CEPS + FEPS) + (CDPS - FDPS)/(CEPS + FEPS) * (1/2 - x/this.Stm) * y;
	this.tdo = this.dps * this.st;
	
	if (this.dps > CDPS){
		//console.log("Violation of Comp DPS Axiom: OVERflow: " + this.name + "," + this.fmove.name + "," + this.cmove.name);
		this.dps = CDPS;
		this.tdo = this.dps * this.st;
	}else if (this.dps < FDPS){
		//console.log("Violation of Comp DPS Axiom: UNDERflow: " + this.name + "," + this.fmove.name + "," + this.cmove.name);
		this.dps = FDPS;
		this.tdo = this.dps * this.st;
	}
	
	return this.dps;
}



Pokemon.prototype.calc_defender = function(atkr){
	if (Context.generic_enemy_bool){
		return {
			dps: 900 / atkr.Def,
			extra_energy_wasted: 0
		};
	}else{
		var FDmg = damage2(this, atkr, this.fmove, Context.weather);
		var CDmg = damage2(this, atkr, this.cmove, Context.weather);
		var FDur = this.fmove.duration/1000 + 2;
		var CDur = this.cmove.duration/1000 + 2;
		var FE = this.fmove.energyDelta;
		var CE = -this.cmove.energyDelta;
		
		var n = Math.max(1, 3 * CE / 100);
		
		return {
			dps: (n * FDmg + CDmg)/(n * FDur + CDur),
			extra_energy_wasted:  0.5 * (n * FDmg + CDmg)/(n + 1)
		};
	}
}


function damage2(dmg_giver, dmg_taker, move, weather){
	var stab = 1;
	if (move.pokeType == dmg_giver.pokeType1 || move.pokeType == dmg_giver.pokeType2){
		stab = BATTLE_SETTINGS.sameTypeAttackBonusMultiplier;
	}
	var wab = 1;
	if (WEATHER_BOOSTED_TYPES[weather].includes(move.pokeType)){
		wab = BATTLE_SETTINGS.weatherAttackBonusMultiplier;
	}
	var effe1 = TYPE_ADVANTAGES[move.pokeType][dmg_taker.pokeType1] || 1;
	var effe2 = TYPE_ADVANTAGES[move.pokeType][dmg_taker.pokeType2] || 1;
	return 0.5*dmg_giver.Atk/dmg_taker.Def*move.power*effe1*effe2*stab*wab + 0.5;
}

// https://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript/901144#901144
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function setConfigFromUrl(url){
	if (url.includes('?')){
		var cfg = {};
		try{
			cfg = uriToJSON(url.split('?')[1]);
		}catch(err){
			ConfigurableAttributes.forEach(function(info){
				cfg[info.elementId || info.qsField] = getParameterByName(info.qsField, url) || info.defaultValue;
			});
		}
		ConfigurableAttributes.forEach(function(info){
			$('#' + info.elementId).val(cfg[info.elementId] || info.defaultValue);
			if (info.iconGetter){
				$('#' + info.elementId).attr('style', "background-image: url(" + info.iconGetter({name: cfg[info.elementId], mtype: info.elementId[0]}) + ")");
			}
			if (info.database){
				$('#' + info.elementId).attr('index', getIndexByName(cfg[info.elementId], window[info.database]));
			}
		});		
		if (cfg['by'] || cfg['order']){
			var col_idx = colHeaders.indexOf(cfg['by'] || 'DPS');
			if (col_idx >= 0){
				Table.order([col_idx, cfg['order'] || 'desc']);
			}
		}
	}
}

function setUrlFromConfig(){
	var cfg = {}, non_default_flag = false;
	
	var sortingSetting = Table.settings().context[0].aaSorting[0];
	if (sortingSetting){
		var sortBy = [colHeaders[sortingSetting[0]], sortingSetting[1]];
		cfg['by'] = sortBy[0];
		cfg['order'] = sortBy[1];
	}
	ConfigurableAttributes.forEach(function(info){
		var val = info.elementId ? $('#' + info.elementId).val() : cfg[info.qsField];
		if (val == info.defaultValue){
			delete cfg[info.qsField];
		}else{
			cfg[info.qsField] = val;
			non_default_flag = true;
		}
	});
	
	if (non_default_flag)
		window.history.pushState('', '', window.location.href.split('?')[0] + '?' + $.param(cfg));
}




function applicationInit(){
	acceptedNumericalAttributes = acceptedNumericalAttributes.concat(['dps', 'tdo']);
	
	var weatherSelect = document.getElementById('weather');
	WEATHER_LIST.forEach(function(weather){
		weatherSelect.appendChild(createElement('option', weather, {value: weather}));
	});
	weatherSelect.value = DEFAULT_WEATHER;
	
	autocompletePokemonNodeSpecies(document.getElementById('ui-species_d'));
	$( "#ui-species_d" ).on( "autocompleteselect", function(event, ui){
		document.getElementById('d-pokeType1').value = ui.item.pokeType1;
		document.getElementById('d-pokeType2').value = ui.item.pokeType2;
		copyAllInfo(Context.enemy, ui.item);
		$(this).val(ui.item.label);
		this.setAttribute('index', ui.item.index);
		if ($('#fmove_d').attr('index') >= 0 && $('#cmove_d').attr('index') >= 0){
			recalculate();
		}
	});
	
	autocompletePokemonNodeMoves(document.getElementById('fmove_d'));
	$( "#fmove_d" ).on( "autocompleteselect", function(event, ui){
		$(this).val(ui.item.label);
		this.setAttribute('index', ui.item.index);
		if ($('#ui-species_d').attr('index') >= 0 && $('#cmove_d').attr('index') >= 0){
			recalculate();
		}
	});
	
	autocompletePokemonNodeMoves(document.getElementById('cmove_d'));
	$( "#cmove_d" ).on( "autocompleteselect", function(event, ui){
		$(this).val(ui.item.label);
		this.setAttribute('index', ui.item.index);
		if ($('#ui-species_d').attr('index') >= 0 && $('#fmove_d').attr('index') >= 0){
			recalculate();
		}
	});
	
	var enemyPokeType1Select = document.getElementById('d-pokeType1');
	var enemyPokeType2Select = document.getElementById('d-pokeType2');
	enemyPokeType1Select.appendChild(createElement('option', toTitleCase(DEFAULT_ENEMY_POKETYPE1), {value: DEFAULT_ENEMY_POKETYPE1}));
	enemyPokeType2Select.appendChild(createElement('option', toTitleCase(DEFAULT_ENEMY_POKETYPE2), {value: DEFAULT_ENEMY_POKETYPE2}));
	for (var pokeType in TYPE_ADVANTAGES){
		enemyPokeType1Select.appendChild(createElement('option', toTitleCase(pokeType), {value: pokeType}));
		enemyPokeType2Select.appendChild(createElement('option', toTitleCase(pokeType), {value: pokeType}));
	}
	enemyPokeType1Select.value = DEFAULT_ENEMY_POKETYPE1;
	enemyPokeType2Select.value = DEFAULT_ENEMY_POKETYPE2;	
	
	var table = document.getElementById('ranking_table');
	var headerRow = document.createElement('tr');
	var footerRow = document.createElement('tr');
	colHeaders.forEach(function(header){
		headerRow.innerHTML += '<th>' + header + '</th>';
		footerRow.innerHTML += '<th></th>';
	});
	table.children[0].appendChild(headerRow);
	table.children[1].appendChild(footerRow);
	
	Table = $(table).DataTable({
		scrollX: true,
		scrollY: '80vh',
		scroller: true,
		"aoColumns": [
			null,
            null,
            null,
            { "orderSequence": [ "desc", "asc"] },
            { "orderSequence": [ "desc", "asc"] },
            { "orderSequence": [ "desc", "asc"] },
            { "orderSequence": [ "desc", "asc"] }
        ]
	});
	$('#ranking_table_filter').hide();
	Table.order( [ 3, 'desc' ] );
	
	setConfigFromUrl(window.location.href);
	
	calculate();
	
	Table.table().header().onclick = function(){
		setUrlFromConfig();
	}

	Table.columns().flatten().each(function (colIdx){
		var select = $('<select />')
			.appendTo(
				Table.column(colIdx).footer()
			)
			.on( 'change', function (){
				Table.column( colIdx ).search( $(this).val() ).draw();
			});
		
		select.append( $("<option value=' '>*</option>") );
		Table.column( colIdx ).cache( 'search' ).sort().unique()
			.each( function ( d ) {
				var op = document.createElement('option');
				op.value = d;
				op.innerHTML = d;
				select.append(op);
			});
	});
}


function applyContext(){
	Context.weather = document.getElementById('weather').value;
	
	Context.generic_enemy_bool = false;
	var d_index = parseInt(document.getElementById('ui-species_d').getAttribute('index'));
	var d_fmove_index = parseInt(document.getElementById('fmove_d').getAttribute('index'));
	var d_cmove_index = parseInt(document.getElementById('cmove_d').getAttribute('index'));
	if (d_index < 0 || d_fmove_index < 0 || d_cmove_index < 0){
		Context.generic_enemy_bool = true;
		d_index = d_fmove_index = d_cmove_index = 0;
	}
	
	Context.enemy = new Pokemon({
		index: d_index,
		fmove_index: d_fmove_index,
		cmove_index: d_cmove_index,
		level: 40,
		atkiv: DEFAULT_IVs[0],
		defiv: DEFAULT_IVs[1],
		stmiv: DEFAULT_IVs[2],
		raid_tier: 0
	});
	Context.enemy.pokeType1 = document.getElementById('d-pokeType1').value;
	Context.enemy.pokeType2 = document.getElementById('d-pokeType2').value;
	
	if (Context.generic_enemy_bool){
		Context.enemy.Def = DEFAULT_ENEMY_CURRENT_DEFENSE;
	}
	
	setUrlFromConfig();
}


// Generate a spectrum of DPS
function generate_DPS_spectrum(pkm, settings){
	settings = settings || {};
	var X_min = settings.X_min || 0, X_max = settings.X_max || 100, X_num = settings.X_num || 100, X_step = (X_max - X_min) / X_num;
	var Y_min = settings.Y_min || 0, Y_max = settings.Y_max || 1500/pkm.Def, Y_num = settings.Y_step || 100, Y_step = (Y_max - Y_min) / Y_num;
	var DPS_spectrum = [];
	for (var x = X_min; x < X_max; x += X_step){
		var row = [];
		for (var y = Y_min; y < Y_max; y += Y_step){
			row.push(pkm.calc_DPS(x, y));
		}
		DPS_spectrum.push(row);
	}
	return DPS_spectrum;
}


// Calculate DPS and TDO
function calculate(){
	ALL_COMBINATIONS = [];
	Table.clear();
	
	applyContext();
	
	for (var i = 0; i < POKEMON_SPECIES_DATA.length; i++){
		var pkm = POKEMON_SPECIES_DATA[i];
		var fastMoves_all = pkm.fastMoves.concat(pkm.fastMoves_legacy).concat(pkm.fastMoves_exclusive);
		var chargedMoves_all = pkm.chargedMoves.concat(pkm.chargedMoves_legacy).concat(pkm.chargedMoves_exclusive);
		for (var j = 0; j < fastMoves_all.length; j++){
			for (var k = 0; k < chargedMoves_all.length; k++){
				var pkm2 = JSON.parse(JSON.stringify(pkm));
				
				pkm2.fmove_index = getIndexByName(fastMoves_all[j], FAST_MOVE_DATA);
				pkm2.cmove_index = getIndexByName(chargedMoves_all[k], CHARGED_MOVE_DATA);
				if (pkm2.fmove_index < 0 || pkm2.cmove_index < 0){
					console.log("Unrecognized move " + fastMoves_all[j] + ' or ' + chargedMoves_all[k]);
					continue;
				}
				
				pkm2.level = DEFAULT_LEVEL;
				pkm2.atkiv = DEFAULT_IVs[0];
				pkm2.defiv = DEFAULT_IVs[0];
				pkm2.stmiv = DEFAULT_IVs[0];
				pkm2.raid_tier = 0;
				
				var pkm2 = new Pokemon(pkm2);
				var dfdrDmg = Context.enemy.calc_defender(pkm2);
				pkm2.calc_DPS( -pkm2.cmove.energyDelta * 0.5 + pkm2.fmove.energyDelta * 0.5 + dfdrDmg.extra_energy_wasted, dfdrDmg.dps );
				pkm2.cp = calculateCP(pkm2);
				
				Table.row.add([
					createIconLabelDiv2(pkm2.icon, pkm2.label, 'species-input-with-icon'), 
					createIconLabelDiv2(pkm2.fmove.icon, pkm2.fmove.label, 'move-input-with-icon'), 
					createIconLabelDiv2(pkm2.cmove.icon, pkm2.cmove.label, 'move-input-with-icon'), 
					Math.round(pkm2.dps * 1000) / 1000, 
					Math.round(pkm2.tdo * 10) / 10,
					Math.round(pkm2.dps * pkm2.tdo * 10) / 10,
					pkm2.cp
				]);

				ALL_COMBINATIONS.push(pkm2);
			}
		}
	}
	console.log(Date() + ": All DPS calculated");
	pred = createComplexPredicate($('#searchInput').val());
	$("#ranking_table").DataTable().draw();
}


function recalculate(){
	applyContext();
	
	var i = 0;
	Table.data().each(function(row){
		var pkm2 = ALL_COMBINATIONS[i];
		var dfdrDmg = Context.enemy.calc_defender(pkm2);
		pkm2.calc_DPS( -pkm2.cmove.energyDelta * 0.5 + pkm2.fmove.energyDelta * 0.5 + dfdrDmg.extra_energy_wasted, dfdrDmg.dps );
		row[3] = Math.round(pkm2.dps * 1000) / 1000;
		row[4] = Math.round(pkm2.tdo * 10) / 10;
		row[5] = Math.round(pkm2.dps * pkm2.tdo * 10) / 10;
		i++;
	});
	
	console.log(Date() + ": All DPS re-calculated");
	Table.rows().invalidate();
	pred = createComplexPredicate($('#searchInput').val());
	$("#ranking_table").DataTable().draw();
}

function calculate_defender(){
	DPS_dict = {};
	
	var type_list = ['none'];
	for (var type in TYPE_ADVANTAGES){
		type_list.push(type);
	}
	
	Context.enemy.Def = DEFAULT_ENEMY_CURRENT_DEFENSE;
	for (var i = 0; i < type_list.length - 1; i++){
		type1 = type_list[i];
		for (var j = i + 1; j < type_list.length; j++){
			type2 = type_list[j];
			Context.enemy.pokeType1 = type1;
			Context.enemy.pokeType2 = type2;
			DPS_dict[type1 + ',' + type2] = 0;
			DPS_dict[type2 + ',' + type1] = 0;
			for (var k = 0; k < ALL_COMBINATIONS.length; k++){
				var pkm2 = ALL_COMBINATIONS[k];
				pkm2.calc_DPS( -pkm2.cmove.energyDelta * 0.5 + pkm2.fmove.energyDelta * 0.5, 400 / pkm2.Def );
				if (pkm2.dps > DPS_dict[type1 + ',' + type2]){
					DPS_dict[type1 + ',' + type2] = pkm2.dps;
					DPS_dict[type2 + ',' + type1] = pkm2.dps;
				}
			}
		}
	}
	
	for (var i = 0; i < ALL_COMBINATIONS.length; i++){
		var pkm2 = ALL_COMBINATIONS[i];
		var dps_in = DPS_dict[pkm2.pokeType1 + ',' + pkm2.pokeType2];
		pkm2.defender_time = 2 * pkm2.Stm * pkm2.Def / (dps_in * DEFAULT_ENEMY_CURRENT_DEFENSE);
	}
	
	ALL_COMBINATIONS.sort(function(a,b){return b.defender_time - a.defender_time;});
	
	names = [];
	str = '';
	for (var i = 0; i < ALL_COMBINATIONS.length && names.length < 100; i++){
		name = ALL_COMBINATIONS[i].label;
		if (!names.includes(name)){
			str += name + '\t' + ALL_COMBINATIONS[i].defender_time + '\n';
			names.push(name);
		}
	}
	copy(str.trim());
}





// Calculate PVP Outcome
function calc_pvp_outcome(pkm1, pkm2){
	var FDmg1 = damage(pkm1, pkm2, pkm1.fmove, Context.weather), FDmg2 = damage(pkm2, pkm1, pkm2.fmove, Context.weather);
	var CDmg1 = damage(pkm1, pkm2, pkm1.cmove, Context.weather), CDmg2 = damage(pkm2, pkm1, pkm2.cmove, Context.weather);
	var FDur1 = pkm1.fmove.duration/1000, FDur2 = pkm2.fmove.duration/1000;
	var CDur1 = pkm1.cmove.duration/1000, CDur2 = pkm2.cmove.duration/1000;
	var FE1 = pkm1.fmove.energyDelta, FE2 = pkm2.fmove.energyDelta;
	var CE1 = -pkm1.cmove.energyDelta, CE2 = -pkm2.cmove.energyDelta;
	var HP1 = pkm1.Stm, HP2 = pkm2.Stm;
	
	
}


function get_combination(species_query, fmove_query, cmove_query){
	pred_s = createComplexPredicate(species_query || '');
	pred_f = createComplexPredicate(fmove_query || '');
	pred_c = createComplexPredicate(cmove_query || '');
	
	var result = [];
	for (var i = 0; i < ALL_COMBINATIONS.length; i++){
		var pkm = ALL_COMBINATIONS[i];
		if (pred_s(pkm) && pred_f(pkm.fmove) && pred_c(pkm.cmove))
			result.push(pkm);
	}
	return result;
}



var lastKeyUpTime = 0;
pred = function(obj){return true;}
function search_trigger(){
	lastKeyUpTime = Date.now();
	setTimeout(function(){
		if (Date.now() - lastKeyUpTime >= 600){
			pred = createComplexPredicate($('#searchInput').val());
			$("#ranking_table").DataTable().draw();
		}
	}, 600);
}

$.fn.dataTable.ext.search.push(
    function( settings, searchData, index, rowData, counter ) {
		var pkm = ALL_COMBINATIONS[index];
		var res = true;
		try{ res = pred(pkm);} catch(err){ res = true; }
		return res;
    }
);