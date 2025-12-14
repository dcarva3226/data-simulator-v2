/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.daily.usage.teams.activity.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 3/27/2024
 @Notes: see individual functions below for more details. This reuses ssi.datasim.create.daily.usage.js,
 but it looks at faked Teams meeting counts data in cmdb_teams_user_daily_activity and creates matching 
 usage. After this script runs, run script to create hourly usage, logon records and possibly user breaks.
=============================================================================================================*/

let cfg = {
      debug             : "None",
      source            : "@datasim",
      update            : true
};

let rpt = {	
      err               : "None",
      logName           : "Create Daily Usage",      
      params            : "",
      totProgs          : 0,
      totProgInst       : 0,
      totRecsSoftware   : 0,
      totRecsWebApp     : 0,
      totSpkgs          : 0,
      totUtils          : 0,
      alreadyHasDailyUsage : 0
};

let tbl = {
      acu_gp            : "acu_group_person",
      acu_grp           : "acu_group",
      acu_gt            : "acu_group_type",
      cfg               : "ds_daily_usage_config",
      cmpny             : "cmdb_discovered_company",
      comp              : "cmdb_ci_computer",
      dev_res_util      : "cmdb_device_resource_util",
      du                : "cmdb_program_daily_usage",
      exc_usrs          : "ds_daily_usage_users_exclude",
      inc_grps          : "ds_daily_usage_groups_include",
      inc_usrs          : "ds_daily_usage_users_include",
      log               : "ds_daily_usage_log",
      person            : "cmn_person",
      prog              : "cmdb_program",
      prog_inst         : "cmdb_program_instance", 
      soft              : "ds_daily_usage_software",
      spkg              : "cmdb_ci_spkg",
      usage_plans       : "ds_daily_usage_plan",      
      user              : "cmn_user",
      wdu               : "cmdb_webapp_daily_usage",
      web               : "ds_daily_usage_webapp",
};

let run = function() {

      let objCfg        = loadCfg();

      if (!objCfg.create_pdu && !objCfg.create_hw) {
            this.rpt.err = "There is no work to be done.";
            return true;
      }
            
      let desktopApps   = getDesktopAppConfig();
      let webApps       = getWebAppConfig();
      let startDate     = new java.util.Date(objCfg.start_date);
      let endDate       = new java.util.Date(objCfg.end_date); 
      let days          = getDateDiff(startDate, endDate) + 1;
      
      let incGroups     = getConfigData(this.tbl.inc_grps, "group");
// CUSTOM:     let incUsrs       = getConfigData(this.tbl.inc_usrs, "user");          
      let excUsrs       = getConfigData(this.tbl.exc_usrs, "user");      
      
      let applications  = [desktopApps, webApps];            
      let totApps       = desktopApps.length + webApps.length;
      let totAppsCnt    = 0;
    
/* CUSTOM ************************************************************/

// Get a list of daily users from the teams daily activity table. I 
// will use that list to build usage against.
    
let cols = new java.util.ArrayList();
cols.add(Query.column("tu.user", "user")); 
     
let q = Query.selectDistinct(cols);
q.from("cmdb_teams_user_daily_activity", "tu");
q.where(OR(GT("tu.teams_meeting_count", 0), 
    GT("tu.other_meeting_count", 0), 
    GT("tu.other_external_meeting_count", 0)));
let incUsrs = this.exec.executeL1(q);      

/* END CUSTOM ********************************************************/  
    
      // Create usage for desktop and web apps
      for (let n = 0; n < applications.length; n++) {
            
            let apps = applications[n];
            
            // Loop through each software title that requires usage
            for (let i = 0; i < apps.length; i++) {
                 
                  let app           = apps[i];
                  let users         = getUsers(app, incGroups, incUsrs, excUsrs);               
                  let usrLen        = users.length;
                  let daysCnt       = 0;                        
                  let targetDate    = new java.util.Date(objCfg.start_date);  
                  
                  let isWebApp = (app.webapp) ? true : false;
                  
                  if (usrLen == 0) {
                        throw String.format("Could not find users for software {0}.{1}",
                        "Ensure that 'Select Software' group filters are not excluding them.",
                        + (!isWebApp) ? app.spkg : app.webapp);
                  }

                  // Get the data for the different usage patterns we will use
                  let usagePlans = getUsagePlans(objCfg, days);

                  // Loop through each day in the date range            
                  for (let day = 1; day <= days; day++) {

                        let dayCnt = (day > 1) ? 1 : 0;    
                        targetDate.setDate(targetDate.getDate() + dayCnt);                                         
                        if (this.excludedDay(targetDate, objCfg.exclude_weekends)) continue;
                        let curWeek = getCurWeek(day, days); // Zero based

                        // Counters for user types (lt, med, heavy) for daily usage
                        let lupUsrCnt        = Math.round(usrLen * (objCfg.lup * .01));
                        let mupUsrCnt        = Math.round(usrLen * (objCfg.mup * .01));
                        let hupUsrCnt        = Math.round(usrLen * (objCfg.hup * .01));
                        let nupUsrCnt        = Math.round(usrLen * (objCfg.nup * .01));
                  
                        // Counters for daily usage pattern percentages
                        let plan1UsrCnt      = Math.round(usrLen * (objCfg.plan_1 * .01));
                        let plan2UsrCnt      = Math.round(usrLen * (objCfg.plan_2 * .01));
                        let plan3UsrCnt      = Math.round(usrLen * (objCfg.plan_3 * .01));
                        let plan4UsrCnt      = Math.round(usrLen * (objCfg.plan_4 * .01));
                        
                        // Handle cases where only one user is in play
                        if (lupUsrCnt == 0) lupUsrCnt = 1;
                            
                        // Loop through each user that requires usage
                        for (let x = 0; x < usrLen; x++) {
            
                              if (jobHandle.isStopped()) throw "Manual script cancellation...";            
                              
                              let user = users[x];
            
/* CUSTOM ************************************************************/       

// Does the user have teams daily user activity on this day?            
                                 
let critties = new java.util.ArrayList();
critties.add(EQ("date", targetDate));
critties.add(EQ("user", user));
critties.add(OR(GT("teams_meeting_count", 0), 
                    GT("other_meeting_count", 0), 
                    GT("other_external_meeting_count", 0)));        

let entityTeamsActivity = this.mgr.readEntity("cmdb_teams_user_daily_activity", AND(critties));
//if (!entityTeamsActivity) throw targetDate + ", " + user;
if (!entityTeamsActivity) continue;

/* END CUSTOM ********************************************************/                
                                    
                              let installedOn = this.getComputer(user);
                              if (!installedOn) throw "Could not find computer for user " + user + ".";
                              
                              // Create daily usage flag is true?
                              if (objCfg.create_pdu) {

// Randomly skip a day so there isn't usage every single day
//if (this.rand(1, 10, 0) == 10) continue;
//if (this.rand(1, 2, 0) == 1) continue;            

                                    let minKeys = 0, maxKeys = 0, minMins = 0, maxMins = 0, minMOuse = 0, maxMouse = 0;
                                    
                                    if (plan1UsrCnt != 0) {
                                          plan1UsrCnt--;
                                          usagePlan = usagePlans[0];
                                    } else if (plan2UsrCnt != 0) {
                                          plan2UsrCnt--;
                                          usagePlan = usagePlans[1];
                                    } else if (plan3UsrCnt != 0) {
                                          plan3UsrCnt--;
                                          usagePlan = usagePlans[2];
                                    } else if (plan4UsrCnt != 0) {
                                          plan4UsrCnt--;
                                          usagePlan = usagePlans[3];
                                    } else {
                                          // Too few users, just use first plan
                                          plan1UsrCnt--;
                                          usagePlan = usagePlans[0];
                                    }
                                    
                                    let weekData = usagePlan[curWeek-1];                     

                                    // First do the % of lup, then % of mup, then % of hup
                                    if (lupUsrCnt != 0) {
                                          lupUsrCnt--;
                                          minMins = weekData[2];
                                          maxMins = weekData[3];
                                          minKeys = weekData[4];
                                          maxKeys = weekData[5];
                                          minMous = weekData[6];
                                          maxMous = weekData[7];
                                    } else if (mupUsrCnt != 0) {
                                          mupUsrCnt--;
                                          minMins = weekData[8];
                                          maxMins = weekData[9];
                                          minKeys = weekData[10]; 
                                          maxKeys = weekData[11];
                                          minMous = weekData[12];
                                          maxMous = weekData[13];
                                    } else if (hupUsrCnt != 0) {
                                          hupUsrCnt--;
                                          minMins = weekData[14];
                                          maxMins = weekData[15];
                                          minKeys = weekData[16];
                                          maxKeys = weekData[17];
                                          minMous = weekData[18];
                                          maxMous = weekData[19];                             
                                    } else if (nupUsrCnt != 0) {
                                          nupUsrCnt--;
                                          continue;
                                    }

/* CUSTOM ************************************************************/

// Determine how many minutes_in_use to create based on total team
// meeting duration.

if (entityTeamsActivity) {

let total = entityTeamsActivity.get("teams_meeting_duration") + 
                    entityTeamsActivity.get("other_meeting_duration") + 
                    entityTeamsActivity.get("other_external_meeting_duration");  

    minMins = total;
    maxMins = minMins + 15;
} else {
    throw "Error getting teams daily activity meeting duration...";
}

/* END CUSTOM ********************************************************/  

                                    let hourlyData = getHourlyUsage(minMins, maxMins, objCfg.start_hour, objCfg.end_hour);
                                    let useTime = hourlyData[0]; 
                                    let runTime = hourlyData[1];
                                    let focusMinutes = hourlyData[2];
                                    let minutesInUse = useTime.getSum();
                                    let uptimeMinutes = runTime.getSum();
                                    if (!isWebApp) let programInstance = getOrCreateProgramInstance(installedOn, app);
                                    let timesStarted = this.rand(objCfg.min_times_started, objCfg.max_times_started, 0);
                                    
                                    // Make sure we haven't already added the usage already
                                    if (checkForDailyUsage(installedOn, user, programInstance, targetDate, isWebApp, app.webapp)) {
                                          this.rpt.alreadyHasDailyUsage++;
                                          continue;
                                    }
                                    
                                    // Add the new usage record
                                    let usage = this.mgr.create((!isWebApp) ? this.tbl.du : this.tbl.wdu);                               
                                    usage.set("usage_date",       targetDate);
                                    usage.set("user",             user);
                                    usage.set("used_from",        installedOn);                      
                                    usage.set("day_of_week",      targetDate.getDay());
                                    usage.set("keystrokes",       (minutesInUse > 0) ? this.rand(minKeys, maxKeys, 0) : 0);
                                    usage.set("minutes_in_use",   minutesInUse);
                                    usage.set("uptime_minutes",   uptimeMinutes);
                                    usage.set("mouse_clicks",     (minutesInUse > 0) ? this.rand(minMous, maxMous, 0) : 0);
                                    usage.set("focus_minutes",    focusMinutes.getBytes());
                                    usage.set("times_started",    timesStarted);
                                    usage.set("run_time",         runTime.getBytes());
                                    usage.set("use_time",         useTime.getBytes());
                                    usage.set("utc_offset",       0);
                                    usage.set("startup_time",      rand(0, 1000, 0));
                                    usage.set("thin_client",      false);
                                    
                                    if (!isWebApp) {
                                          usage.set("program_instance", programInstance);
                                          this.rpt.totRecsSoftware++;
                                    } else {
                                          usage.set("webapp", app.webapp);
                                          this.rpt.totRecsWebApp++;                                    
                                    }                              
                                    
                                    if (this.cfg.update) usage.save();

                              }
                              
                              // Create hardware utilization flag is true?
                              if (objCfg.create_hw) {
                                    
                                    if (!checkForHwUtil(installedOn, targetDate)) {
                                    
                                          let util = this.mgr.create(this.tbl.dev_res_util);
                                          util.set("computer", installedOn);
                                          util.set("processor_usage", rand(objCfg.hw_cpu_min, objCfg.hw_cpu_max));
                                          util.set("memory_usage", rand(objCfg.hw_mem_min, objCfg.hw_mem_max));
                                          util.set("usage_date", targetDate);
                                          if (this.cfg.update) util.save();
                                          this.rpt.totUtils++;
                                    }
                                   
                              }                                    
                              
                              this.setJobProgress((totAppsCnt == 0) ? 0 : (totAppsCnt / totApps) * 100.0,
                                    x,
                                    usrLen,
                                    "users",
                                    String.format("Cur Date: {0}, Cur App: {1} {2}", 
                                          targetDate, 
                                          (!isWebApp) ? app.spkg : app.webapp, 
                                          (!isWebApp) ? app.spkg_version : ""));

                        }
                  }
                  
                  totAppsCnt++;
            }            
            
      }
      
      this.rpt.params += String.format("desktop apps: {0}, web apps: {1}", 
            desktopApps.length, 
            webApps.length);      
};

/* ----------------------------------------------------------------------------------------------------------------
 FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

let loadCfg = function() {
	
	let objConfig = {
            create_pdu : true,
            create_hw : true,
            start_date : null,
            end_date : null,
            lup : 0,
            mup : 0,
            hup : 0,
            nup : 0,
            plan_1 : 0,
            plan_2 : 0,
            plan_2_flat : 0,
            plan_3 : 0,
            plan_4 : 0,             
            lu_min_mins : 0,
            lu_max_mins : 0,
            mu_min_mins : 0,
            mu_max_mins : 0,
            hu_min_mins : 0,
            hu_max_mins : 0,
            lu_min_keys : 0,
            lu_max_keys : 0,
            mu_min_keys : 0,
            mu_max_keys : 0,
            hu_min_keys : 0,
            hu_max_keys : 0,
            lu_min_mous : 0,
            lu_max_mous : 0,
            mu_min_mous : 0,
            mu_max_mous : 0,
            hu_min_mous : 0,
            hu_max_mous : 0,                    
            exclude_weekends : true,
            min_times_started : 0,
            max_times_started : 0,
            start_hour : 0,
            end_hour : 0,
            hw_cpu_min : 0,
            hw_cpu_max : 0,
            hw_mem_min : 0,
            hw_mem_max : 0
	};
	
	let configs = this.mgr.readAllLazily(this.tbl.cfg);
	
	while (configs.hasNext()) 
	{							
		let val = null;
		let config = configs.next();
		let varName = config.get("var_name").replace("ds_cfg_", "");
		let value = config.get("value");
		let type = config.get("type");
		
		switch (type) {
			case "int" :
				val = parseInt(value);
				break;
			case "date" :
				val = new java.util.Date(value);
				break;
			case "bool" : 
				val = (value == "TRUE") ? true : false;
				break;
			default :
				val = value;
				break;                        
		}
		
		objConfig[varName] = val;
		this.rpt.params += varName + ":" + val + ", ";            
	}
	
	return objConfig;
};

// Return one or more software config records
let getDesktopAppConfig = function() {
      
      let cols = new java.util.ArrayList();
      cols.add(Query.column("s.publisher", "publisher"));
      cols.add(Query.column("s.spkg", "spkg"));
      cols.add(Query.column("s.spkg_version", "spkg_version"));
      cols.add(Query.column("s.department", "department"));
      cols.add(Query.column("s.location", "location"));
      cols.add(Query.column("s.role", "role"));
      cols.add(Query.column("s.team", "team"));
      cols.add(Query.column("s.file_name", "file_name"));      
      cols.add(Query.column("s.file_path", "file_path"));      
      cols.add(Query.column("s.file_version", "file_version"));       

      let q = Query.select(cols);
      q.from(this.tbl.soft, "s");
      q.where(EQ("s.enabled", true));
      q.orderBy("s.created_on", Order.ASC);
      let soft = this.exec.executeLM(q);
      
      return soft;
      
};

// Return one or more webapp config records
let getWebAppConfig = function() {
      
      let cols = new java.util.ArrayList();
      cols.add(Query.column("w.webapp", "webapp"));
      cols.add(Query.column("w.department", "department"));
      cols.add(Query.column("w.location", "location"));
      cols.add(Query.column("w.role", "role"));
      cols.add(Query.column("w.team", "team"));

      let q = Query.select(cols);
      q.from(this.tbl.web, "w");
      q.where(EQ("w.enabled", true));
      q.orderBy("w.created_on", Order.ASC);
      let webapps = this.exec.executeLM(q);
      
      return webapps;
      
};

/* ---------------------------------------------------------------------------------
  Preconfigure the value ranges (minutes, keystroke, etc) for creating usage. 
  There will be different types/patterns of usage. I call them plans.
  
  There are 4 plan types:

      Percentage of increasing usage + increasing mouse clicks
      Percentage of increasing usage + increasing mouse clicks but flatten out
      Percentage of increasing usage by interactions stay low (read-only)
      Percentage of decreating usage and decreasing  mouse clicks

  There are 3 usage types:
      light, medium or heavy usage
  
  Each plan type will need 3 usage types thresholds pre-calculated and the 
  tresholds will be divided by weeks. Example:
  
  Plans{4}[
      Weeks{days/7}[
         [Week1, Plan1, lu_min_mins, lu_max_mins, mu_min_mins, ... ]
         [Week2, Plan1, lu_min_mins, lu_max_mins, mu_min_mins, ... ]
         [Week3, Plan1, lu_min_mins, lu_max_mins, mu_min_mins, ... ]
         [Week4, Plan1, lu_min_mins, lu_max_mins, mu_min_mins, ... ]      
      ]
    ],      
         [Week1, Plan2, lu_min_mins, lu_max_mins, mu_min_mins, ... ]
         ...
    ] 
    ...
  ]
  
  These plans will be written to the ds_daily_usage_plans table so that the end
  user can validate them.
  
 ---------------------------------------------------------------------------------*/
let getUsagePlans = function(objCfg, days) {

      this.batchDeleter(this.tbl.usage_plans);

      let numWeeks = ((days / 7) < 1) ? 1 : (days / 7);        
      let weekToFlatten = Math.round(numWeeks * (objCfg.plan_2_flat * .01));
      let plans = []; 

      // If days is 29, for example, then we have 5 weeks
      if ((numWeeks.toFixed(0) % 1) != 0) numWeeks++;
      numWeeks = numWeeks.toFixed(0);
      
      // Loop through each plan
      for (let plan = 1; plan <= 4; plan++) {

            // Set initial values
            let lu_min_mins = objCfg.lu_min_mins;
            let lu_max_mins = 0;
            let mu_min_mins = objCfg.mu_min_mins;
            let mu_max_mins = 0;
            let hu_min_mins = objCfg.hu_min_mins;
            let hu_max_mins = 0;
            let lu_min_keys = objCfg.lu_min_keys;
            let lu_max_keys = 0;
            let mu_min_keys = objCfg.mu_min_keys;
            let mu_max_keys = 0;
            let hu_min_keys = objCfg.hu_min_keys;
            let hu_max_keys = 0;
            let lu_min_mous = objCfg.lu_min_mous;
            let lu_max_mous = 0;
            let mu_min_mous = objCfg.mu_min_mous;
            let mu_max_mous = 0;
            let hu_min_mous = objCfg.hu_min_mous;
            let hu_max_mous = 0;     
            
            let weeks = [];

            // Setup thresholds for each week
            for (let wk = 1; wk <= numWeeks; wk++) {
                  
                  switch (plan) {
                        case 1 : // Percentage of increasing usage + increasing mouse clicks
                              lu_min_mins += (wk == 1) ? 0 : ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks); 
                              lu_max_mins = (wk == numWeeks) ? objCfg.lu_max_mins : lu_min_mins + ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks);
                              mu_min_mins += (wk == 1) ? 0 : ((objCfg.mu_max_mins - objCfg.mu_min_mins)  / numWeeks);
                              mu_max_mins = (wk == numWeeks) ? objCfg.mu_max_mins : mu_min_mins + ((objCfg.mu_max_mins - objCfg.mu_min_mins) / numWeeks);
                              hu_min_mins += (wk == 1) ? 0 : ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                              hu_max_mins = (wk == numWeeks) ? objCfg.hu_max_mins : hu_min_mins + ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                              lu_min_keys += (wk == 1) ? 0 : ((objCfg.lu_max_keys - objCfg.lu_min_keys)  / numWeeks);
                              lu_max_keys = (wk == numWeeks) ? objCfg.lu_max_keys : lu_min_keys + ((objCfg.lu_max_keys - objCfg.lu_min_keys) / numWeeks);
                              mu_min_keys += (wk == 1) ? 0 : ((objCfg.mu_max_keys - objCfg.mu_min_keys)  / numWeeks);
                              mu_max_keys = (wk == numWeeks) ? objCfg.mu_max_keys : mu_min_keys + ((objCfg.mu_max_keys - objCfg.mu_min_keys) / numWeeks);
                              hu_min_keys += (wk == 1) ? 0 : ((objCfg.hu_max_keys - objCfg.hu_min_keys)  / numWeeks);
                              hu_max_keys = (wk == numWeeks) ? objCfg.hu_max_keys : hu_min_keys + ((objCfg.hu_max_keys - objCfg.hu_min_keys) / numWeeks);
                              lu_min_mous += (wk == 1) ? 0 : ((objCfg.lu_max_mous - objCfg.lu_min_mous)  / numWeeks);
                              lu_max_mous = (wk == numWeeks) ? objCfg.lu_max_mous : lu_min_mous + ((objCfg.lu_max_mous - objCfg.lu_min_mous) / numWeeks);
                              mu_min_mous += (wk == 1) ? 0 : ((objCfg.mu_max_mous - objCfg.mu_min_mous)  / numWeeks);
                              mu_max_mous = (wk == numWeeks) ? objCfg.mu_max_mous : mu_min_mous + ((objCfg.mu_max_mous - objCfg.mu_min_mous) / numWeeks);
                              hu_min_mous += (wk == 1) ? 0 : ((objCfg.hu_max_mous - objCfg.hu_min_mous)  / numWeeks);
                              hu_max_mous = (wk == numWeeks) ? objCfg.hu_max_mous : hu_min_mous + ((objCfg.hu_max_mous - objCfg.hu_min_mous) / numWeeks);     
                              break;
                        case 2 : // Percentage of increasing usage + increasing mouse clicks but flatten out
                              if (wk < weekToFlatten || wk == 1) {
                                    lu_min_mins += (wk == 1) ? 0 : ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks); 
                                    lu_max_mins = (wk == numWeeks) ? objCfg.lu_max_mins : lu_min_mins + ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks);
                                    mu_min_mins += (wk == 1) ? 0 : ((objCfg.mu_max_mins - objCfg.mu_min_mins)  / numWeeks);
                                    mu_max_mins = (wk == numWeeks) ? objCfg.mu_max_mins : mu_min_mins + ((objCfg.mu_max_mins - objCfg.mu_min_mins) / numWeeks);
                                    hu_min_mins += (wk == 1) ? 0 : ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                                    hu_max_mins = (wk == numWeeks) ? objCfg.hu_max_mins : hu_min_mins + ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                                    lu_min_keys += (wk == 1) ? 0 : ((objCfg.lu_max_keys - objCfg.lu_min_keys)  / numWeeks);
                                    lu_max_keys = (wk == numWeeks) ? objCfg.lu_max_keys : lu_min_keys + ((objCfg.lu_max_keys - objCfg.lu_min_keys) / numWeeks);
                                    mu_min_keys += (wk == 1) ? 0 : ((objCfg.mu_max_keys - objCfg.mu_min_keys)  / numWeeks);
                                    mu_max_keys = (wk == numWeeks) ? objCfg.mu_max_keys : mu_min_keys + ((objCfg.mu_max_keys - objCfg.mu_min_keys) / numWeeks);
                                    hu_min_keys += (wk == 1) ? 0 : ((objCfg.hu_max_keys - objCfg.hu_min_keys)  / numWeeks);
                                    hu_max_keys = (wk == numWeeks) ? objCfg.hu_max_keys : hu_min_keys + ((objCfg.hu_max_keys - objCfg.hu_min_keys) / numWeeks);
                                    lu_min_mous += (wk == 1) ? 0 : ((objCfg.lu_max_mous - objCfg.lu_min_mous)  / numWeeks);
                                    lu_max_mous = (wk == numWeeks) ? objCfg.lu_max_mous : lu_min_mous + ((objCfg.lu_max_mous - objCfg.lu_min_mous) / numWeeks);
                                    mu_min_mous += (wk == 1) ? 0 : ((objCfg.mu_max_mous - objCfg.mu_min_mous)  / numWeeks);
                                    mu_max_mous = (wk == numWeeks) ? objCfg.mu_max_mous : mu_min_mous + ((objCfg.mu_max_mous - objCfg.mu_min_mous) / numWeeks);
                                    hu_min_mous += (wk == 1) ? 0 : ((objCfg.hu_max_mous - objCfg.hu_min_mous)  / numWeeks);
                                    hu_max_mous = (wk == numWeeks) ? objCfg.hu_max_mous : hu_min_mous + ((objCfg.hu_max_mous - objCfg.hu_min_mous) / numWeeks);
                              }                             
                              break;
                        case 3 : // Percentage of increasing usage by interactions stay low (read-only)                        
                              lu_min_mins += (wk == 1) ? 0 : ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks); 
                              lu_max_mins = (wk == numWeeks) ? objCfg.lu_max_mins : lu_min_mins + ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks);
                              mu_min_mins += (wk == 1) ? 0 : ((objCfg.mu_max_mins - objCfg.mu_min_mins)  / numWeeks);
                              mu_max_mins = (wk == numWeeks) ? objCfg.mu_max_mins : mu_min_mins + ((objCfg.mu_max_mins - objCfg.mu_min_mins) / numWeeks);
                              hu_min_mins += (wk == 1) ? 0 : ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                              hu_max_mins = (wk == numWeeks) ? objCfg.hu_max_mins : hu_min_mins + ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                              lu_min_keys = 5;
                              lu_max_keys = 10;
                              mu_min_keys = 10;
                              mu_max_keys = 15;
                              hu_min_keys = 15;
                              hu_max_keys = 20;
                              lu_min_mous += (wk == 1) ? 0 : ((objCfg.lu_max_mous - objCfg.lu_min_mous)  / numWeeks);
                              lu_max_mous = (wk == numWeeks) ? objCfg.lu_max_mous : lu_min_mous + ((objCfg.lu_max_mous - objCfg.lu_min_mous) / numWeeks);
                              mu_min_mous += (wk == 1) ? 0 : ((objCfg.mu_max_mous - objCfg.mu_min_mous)  / numWeeks);
                              mu_max_mous = (wk == numWeeks) ? objCfg.mu_max_mous : mu_min_mous + ((objCfg.mu_max_mous - objCfg.mu_min_mous) / numWeeks);
                              hu_min_mous += (wk == 1) ? 0 : ((objCfg.hu_max_mous - objCfg.hu_min_mous)  / numWeeks);
                              hu_max_mous = (wk == numWeeks) ? objCfg.hu_max_mous : hu_min_mous + ((objCfg.hu_max_mous - objCfg.hu_min_mous) / numWeeks);     
                              break;
                        case 4 : // Percentage of decreating usage and decreasing mouse clicks                        
                              lu_min_mins = (wk == 1) ? objCfg.lu_max_mins : lu_min_mins - ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks);
                              lu_max_mins = lu_min_mins - ((objCfg.lu_max_mins - objCfg.lu_min_mins) / numWeeks);
                              mu_min_mins = (wk == 1) ? objCfg.mu_max_mins : mu_min_mins - ((objCfg.mu_max_mins - objCfg.mu_min_mins) / numWeeks);
                              mu_max_mins = mu_min_mins - ((objCfg.mu_max_mins - objCfg.mu_min_mins) / numWeeks);
                              hu_min_mins = (wk == 1) ? objCfg.hu_max_mins : hu_min_mins - ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);
                              hu_max_mins = hu_min_mins - ((objCfg.hu_max_mins - objCfg.hu_min_mins) / numWeeks);                          
                              lu_min_keys = (wk == 1) ? objCfg.lu_max_keys : lu_min_keys - ((objCfg.lu_max_keys - objCfg.lu_min_keys) / numWeeks);
                              lu_max_keys = lu_min_keys - ((objCfg.lu_max_keys - objCfg.lu_min_keys) / numWeeks);
                              mu_min_keys = (wk == 1) ? objCfg.mu_max_keys : mu_min_keys - ((objCfg.mu_max_keys - objCfg.mu_min_keys) / numWeeks);
                              mu_max_keys = mu_min_keys - ((objCfg.mu_max_keys - objCfg.mu_min_keys) / numWeeks);
                              hu_min_keys = (wk == 1) ? objCfg.hu_max_keys : hu_min_keys - ((objCfg.hu_max_keys - objCfg.hu_min_keys) / numWeeks);
                              hu_max_keys = hu_min_keys - ((objCfg.hu_max_keys - objCfg.hu_min_keys) / numWeeks); 
                              lu_min_mous = (wk == 1) ? objCfg.lu_max_mous : lu_min_mous - ((objCfg.lu_max_mous - objCfg.lu_min_mous) / numWeeks);
                              lu_max_mous = lu_min_mous - ((objCfg.lu_max_mous - objCfg.lu_min_mous) / numWeeks);
                              mu_min_mous = (wk == 1) ? objCfg.mu_max_mous : mu_min_mous - ((objCfg.mu_max_mous - objCfg.mu_min_mous) / numWeeks);
                              mu_max_mous = mu_min_mous - ((objCfg.mu_max_mous - objCfg.mu_min_mous) / numWeeks);
                              hu_min_mous = (wk == 1) ? objCfg.hu_max_mous : hu_min_mous - ((objCfg.hu_max_mous - objCfg.hu_min_mous) / numWeeks);
                              hu_max_mous = hu_min_mous - ((objCfg.hu_max_mous - objCfg.hu_min_mous) / numWeeks);                               
                              break;
                  }
                  
                  weeks.push([wk, plan, lu_min_mins, lu_max_mins, lu_min_keys, lu_max_keys, lu_min_mous, lu_max_mous,
                              mu_min_mins, mu_max_mins, mu_min_keys, mu_max_keys, mu_min_mous, mu_max_mous,
                              hu_min_mins, hu_max_mins, hu_min_keys, hu_max_keys, hu_min_mous, hu_max_mous]);                  
                  
                  // Write out to database for review                            
                  let entity = this.mgr.create(this.tbl.usage_plans);    
                  entity.set("week", wk);
                  entity.set("plan", plan);
                  entity.set("lu_min_mins", lu_min_mins);
                  entity.set("lu_max_mins", lu_max_mins);
                  entity.set("mu_min_mins", mu_min_mins);
                  entity.set("mu_max_mins", mu_max_mins);
                  entity.set("hu_min_mins", hu_min_mins);
                  entity.set("hu_max_mins", hu_max_mins);
                  entity.set("lu_min_keys", lu_min_keys);
                  entity.set("lu_max_keys", lu_max_keys);
                  entity.set("mu_min_keys", mu_min_keys);
                  entity.set("mu_max_keys", mu_max_keys);
                  entity.set("hu_min_keys", hu_min_keys);
                  entity.set("hu_max_keys", hu_max_keys);                  
                  entity.set("lu_min_mous", lu_min_mous);
                  entity.set("lu_max_mous", lu_max_mous);
                  entity.set("mu_min_mous", mu_min_mous);
                  entity.set("mu_max_mous", mu_max_mous);
                  entity.set("hu_min_mous", hu_min_mous);
                  entity.set("hu_max_mous", hu_max_mous);         
                  entity.save();                                                         
            }
            plans.push(weeks);
      }
            
      return plans;
      
};

// Work out unique users from included groups, included/excluded users
let getUsers = function(software, incGroups, incUsrs, excUsrs) {
            
      // Look for any software group filters from the "Select Software" menu
      let dept          = getGroup("department", software.department);
      let loc           = getGroup("location", software.location);
      let team          = getGroup("team", software.team);
      let role          = getGroup("role", software.role);

      // Match software group filters
      let groupCrit = new java.util.ArrayList();
      if (dept) groupCrit.add(EQ("gp.group", dept));
      if (loc)  groupCrit.add(EQ("gp.group", loc));
      if (team) groupCrit.add(EQ("gp.group", team));
      if (role) groupCrit.add(EQ("gp.group", role));

      let groupFilteredUsers = null;
      if (dept || loc || team || role) {
            let fg = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
            fg.from(this.tbl.acu_gp, "gp");
            fg.join(this.tbl.person, "p", "p.id", "gp.person");
            fg.join(this.tbl.user, "u", "u.person", "p.id");
            fg.where(AND(groupCrit));
            groupFilteredUsers = this.exec.executeL1(fg);
      }

      // Get the users from included groups
      let qg = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
      qg.from(this.tbl.acu_gp, "gp");
      qg.join(this.tbl.person, "p", "p.id", "gp.person");
      qg.join(this.tbl.user, "u", "u.person", "p.id");
      qg.where(IN("gp.group", incGroups));
      let groupUsers = this.exec.executeL1(qg);
      
      // Now do run a query with all criteria includedd
      let criterion = new java.util.ArrayList();
      criterion.add(OR(IN("u.id", incUsrs), IN("u.id", groupUsers)));
      criterion.add(NOT_IN("u.id", excUsrs));
      criterion.add(ILIKE("u.source", "%" + this.cfg.source + "%"));
      if (groupFilteredUsers) criterion.add(IN("u.id", groupFilteredUsers));
      
      let q = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
      q.from(this.tbl.user, "u");
      q.where(AND(criterion));

      return this.exec.executeL1(q);

};

// Return a computer's primary user
let getComputer = function(primaryUser) {
  
      let q = Query.select(java.util.Arrays.asList(Query.column("c.id", "id")));
      q.from(this.tbl.comp, "c");
      q.where(EQ("c.primary_user", primaryUser));
      q.limit(1);
      return this.exec.execute1(q);
      
};

let getConfigData = function(tbl, field) {

	let q = Query.select(java.util.Arrays.asList(Query.column("x." + field, field)));
	q.from(tbl, "x");
	return this.exec.executeL1(q);
      
};

// Get records from the acu_group table
let getGroup = function(type, name) {

      let crit = new java.util.ArrayList();
      crit.add(EQ("g.name", name));
      crit.add(ILIKE("t.name", type));

      let q = Query.select(java.util.Arrays.asList(Query.column("g.id", "id")));
      q.from(this.tbl.acu_grp, "g");
      q.join(this.tbl.acu_gt, "t", "t.id", "g.type");
      q.where(AND(crit));
      q.limit(1);
      return this.exec.execute1(q);
      
};

/* ----------------------------------------------------------------------------------------------------------------
 SOFTWARE CREATION FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

// Get or create the needed program instance for daily usage records
let getOrCreateProgramInstance = function(installedOn, software) {

      let company = getOrCreateCompany(software.publisher);
      let spkg = getOrCreateSpkg(installedOn, company, software);      
        
      let crit = new java.util.ArrayList();
      crit.add(EQ("pi.installed_on", installedOn));
      crit.add(EQ("pi.spkg", spkg));
      crit.add(ILIKE("pi.install_path", software["file_path"].replace(/\\/g, "\\\\")));
      crit.add(ILIKE("p.file_name", software["file_name"].replace(/\\/g, "\\\\")));
      crit.add(EQ("p.file_version", software.file_version));
      crit.add(EQ("p.publisher", company));

      // First check to see if it exists
      let q = Query.select(java.util.Arrays.asList(Query.column("pi.id", "id")));
      q.from(this.tbl.prog_inst, "pi");
      q.join(this.tbl.prog, "p", "p.id", "pi.program");
      q.where(AND(crit));
      q.limit(1);
      let progInst = this.exec.execute1(q)

      if (!progInst) {
            progInst = createProgramInstance(installedOn, spkg, company, software);
      }

      return progInst;
      
};

// Create program instance and program if needed
let createProgramInstance = function(installedOn, spkg, company, software) {
    
      let fileName = software.file_name;
      let fileVersion = software.file_version;
    
      let crit = new java.util.ArrayList();      
      crit.add(EQ("p.file_name", fileName));
      crit.add(EQ("p.file_version", fileVersion));
      crit.add(EQ("p.publisher", company));
      
      // Does the needed program already exist?
      let q = Query.select(java.util.Arrays.asList(Query.column("id", "id")));  
      q.from(this.tbl.prog, "p");
      q.where(AND(crit));
      q.limit(1);
      q.orderBy("p.created_on", Order.DESC);
      let programId = this.exec.execute1(q);

      if (!programId) {
            programId = createProgram(software, company);
      }

      let progInst = this.mgr.create(this.tbl.prog_inst);
      progInst.set("installed_on", installedOn);
      progInst.set("program", programId);
      progInst.set("operational", true);
      progInst.set("install_path", software.file_path);
      progInst.set("type", 1);
      progInst.set("spkg", spkg); 
      if (this.cfg.update) progInst.save();
      this.rpt.totProgInst++;
      
      return progInst.get("id");
      
};

// Create the executable
let createProgram = function(software, company) {
  
      let program = this.mgr.create(this.tbl.prog);
      program.set("file_name", software.file_name);
      program.set("file_version", software.file_version);
      program.set("file_size", "9999999");
      program.set("original_name", software.file_name);
      program.set("program_common_name", software.spkg);
      program.set("product_name", software.spkg);      
      program.set("friendly_name", software.spkg);
      program.set("description", "Created by Data Simulator");
      program.set("system_component", false);
      program.set("publisher", company);
      if (this.cfg.update) program.save();
      this.rpt.totProgs++;
      
      return program.get("id");
      
};

// Find or create package
let getOrCreateSpkg = function(installedOn, company, software) {
  
      let spkgName = software.spkg;
      let spkgVer = software.spkg_version;
      
      let crit = new java.util.ArrayList();  
      crit.add(EQ("friendly_name", spkgName));
      crit.add(EQ("version", spkgVer));
      crit.add(EQ("installed_on", installedOn));
      crit.add(EQ("operational", true));

      let q = Query.select(java.util.Arrays.asList(Query.column("spkg.id", "id")));  
      q.from(this.tbl.spkg, "spkg");
      q.where(AND(crit));
      q.limit(1);
      q.orderBy("spkg.created_on", Order.DESC);
      let spkg = this.exec.execute1(q);  

      if (!spkg) {
            let newSpkg = this.mgr.create(this.tbl.spkg);
            newSpkg.set("name", spkgName);
            newSpkg.set("friendly_name", spkgName);
            newSpkg.set("version", spkgVer);    
            newSpkg.set("installed_on", installedOn);
            newSpkg.set("publisher", company);
            newSpkg.set("operational", true);
            newSpkg.set("os", false);
            newSpkg.set("created_on", new java.util.Date("1/1/2023"));            
            if (this.cfg.update) newSpkg.save();
            this.rpt.totSpkgs++;
            spkg = newSpkg.get("id");
      } 

      return spkg;
      
};

// Return publisher/company id
let getOrCreateCompany = function(companyName) {
  
      let q = Query.select(java.util.Arrays.asList(Query.column("dc.id", "id")));  
      q.from(this.tbl.cmpny, "dc");
      q.where(EQ("name", companyName));
      q.limit(1);
      q.orderBy("dc.created_on", Order.DESC);
      let company = this.exec.execute1(q);

      if (!company) {
            let newCompany = this.mgr.create(this.tbl.cmpny);
            newCompany.set("name", companyName);
            if (cfg.update) newCompany.save();
            company = newCompany.get("id");
      }

      return company;
      
};

/* ----------------------------------------------------------------------------------------------------------------
 USAGE FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

// Check to prevent duplication of usage
let checkForDailyUsage = function(installedOn, user, programInstance, targetDate, isWebApp, webApp) {
  
      let crit = new java.util.ArrayList();  
      crit.add(EQ("t.user", user));
      crit.add(EQ("t.used_from", installedOn));

      if (!isWebApp) {
            crit.add(EQ("t.program_instance", programInstance));
      } else {
            crit.add(EQ("t.webapp", webApp));
      }
      
      crit.add(EQ("t.usage_date", targetDate));  
  
      let table = (!isWebApp) ? this.tbl.du : this.tbl.wdu;
  
      let q = Query.select(java.util.Arrays.asList(Query.column("t.id", "id")));  
      q.from(table, "t");
      q.where(AND(crit));
      q.limit(1);
      let usage = this.exec.execute1(q);
      
      return usage;
      
};

// Check to prevent duplication of hw utilization records
let checkForHwUtil = function(installedOn, targetDate) {
  
      let crit = new java.util.ArrayList();  
      crit.add(EQ("util.computer", installedOn));
      crit.add(EQ("util.usage_date", targetDate));
      
      let q = Query.select(java.util.Arrays.asList(Query.column("util.id", "id")));  
      q.from(this.tbl.dev_res_util, "util");
      q.where(AND(crit));
      q.limit(1);
      return this.exec.execute1(q);
};

/* ----------------------------------------------------------------------------------------------------------------------------------
   Generates hourly usetime, runtime and focus minutes data together. The runTime and useTime hourly buckets have be created in sync.   
   
   Sample usage:
   useTime: 0, 0, 10, 23, 24, 45, 0, 0
   runTime: 0, 0, 15, 60, 60, 55, 0, 0
   
   The useTime and runTime arrays are returned together. The Focus Minutes consists of 1 bit per minute. A total 1440 minutes 
   represented by 180 array elements. 1440 minutes / 8 bits = 180. If the first hour has 1 minute at the start of the hour, then 
   the binary will be a 10000000 binary (80 HEX) value for the first bucket. Example:
   
   10000000 - 80
   00000000 - 00
   00000000 - 00
   00000000 - 00
   00000000 - 00
   00000000 - 00
   00000000 - 00
   00000000 - 00
   
   For 60 mins, you would have:
   
   11111111 - FF
   11111111 - FF
   11111111 - FF
   11111111 - FF
   11111111 - FF
   11111111 - FF
   11111111 - FF
   11110000 - FC   
   
   Above, there are 60 bits for each minute in focus. However, You see how there are four bits left over in the last row?
   The next hour's row of bits gets shifted into that space. Otherwise, we would need 192 buckets, and not 180. 
   The 24 hours * 8 bits would come out to 192 needed buckets if we didn't shift over.
  ---------------------------------------------------------------------------------------------------------------------------------*/
let getHourlyUsage = function(min, max, startHour, endHour) {
      
      let binaries = "";
      let focusMinsEmpty = true;
      let usageMinutes = this.rand(min, max, 0);
      let useTime = getRandomizedArray(usageMinutes, startHour, endHour);
      let runTime = [];
                               
      // Get the first/last non zero buckets to generate runTime
      let first = null, last = null;
      for (let x = 0; x < 24; x++) {
            if (!first && useTime[x] != 0)
                  first = x;
            if (useTime[x] != 0)
                  last = x;
      }      
      
      // Loop through each useTime bucket to write out runTime
      for (let i = 0; i < 24; i++) {
                              
            if (i >= startHour && i <= endHour) {
                  
                  let rt = 0;
                  let ut = parseInt(useTime[i]); // usage mins for cur hour
                  if (i == first || i == last) {
                        rt = this.rand(ut, 60, 0);
                  } else if (i > first && i < last) {
                        rt = 60;
                  }
                  
                  let minCnt = ut;
                  
                  // Create focus minutes
                  for (var y = 0; y < 8; y++) {
                        
                        if (ut == 60) {
                              
                              if (y != 7) {
                                    binaries += "11111111";
                              } else {
                                    binaries += "1111";
                              }
                              
                              focusMinsEmpty = false;
                              
                        } else if (ut == 0) {
                              
                              if (y != 7) {
                                    binaries += "00000000";
                              } else {
                                    binaries += "0000";
                              }
                              
                        } else {
                              
                              let curBinary = ""
                              for (let x = (y!=7) ? 0 : 4; x < 8; x++) {
                                    curBinary += (minCnt > 0) ? 1 : 0;
                                    minCnt--;
                              }
                              
                              binaries += curBinary;                                    
                              focusMinsEmpty = false;
                        }
                  }
                  
                  runTime[i] = rt;
            } else {

                  runTime[i] = 0;
                  binaries += "000000000000000000000000000000000000000000000000000000000000";
            }
      }
      
      // Break out the binary string into 180 hex buckets
      let focusMins = [];
      let start = 0, end = 8;
      
      for (let z = 0; z < 180 && !focusMinsEmpty; z++) {
            let binary = binaries.substring(start, end);
            let hexValue = parseInt(binary, 2);
            focusMins.push(hexValue);
            start += 8;
            end += 8;
      }
      
      return [useTime, runTime, (!focusMinsEmpty) ? focusMins : null];
      
};

/* -----------------------------------------------------------------
  Ok, this is nasty one. This takes an array from startHour to 
  endHour and generates random hourly usage for each day, and the 
  array totals (each array elemented added together) will add up 
  to total daily usage for that day.
  ----------------------------------------------------------------*/
let getRandomizedArray = function(total, startHour, endHour) {
      
      let tempArray = [];
      
      // Set initial array of hourly buckets in range (start to end hour)
      let arrySize = endHour - startHour
      for (let x = 0; x <= arrySize; x++) {
            tempArray.push(0);
      }
      
      let ansa = [];
      let required = total;
      let sum = 0;
      
      for (i = 0; i < tempArray.length; i++) {
          
            max = required - sum;            
            if (max > 60) max = 60;
            
            //if (max > tempArray [i])
            //      max = tempArray [i];
            
            min = required - sum;
            if (min > 60) min = 60;                   
            
            for (j = i+1; j < tempArray.length; j++)
                  min = min - tempArray [j];
          
            if (min < 0) min = 0;

            if (min > max) {
                  total = 0;
                  // break; // Just in case
            }
          
            total = min + Math.floor (Math.random () * (max - min + 1)); 
            ansa [i] = total.toFixed(0);             
            sum = sum + total;
      }
      
      // Zero-pad the other hours
      let finalArray = [];
      ansa = shuffleArray(ansa);
      let ansaPtr = 0;
      for (y = 0; y < 24; y++) {
            
            if (y >= startHour && y <= endHour) {                  
                  finalArray[y] = ansa[ansaPtr];
                  ansaPtr++;
            } else {
                  finalArray[y] = 0;
            }
      }
      
      return finalArray;
      
};

// Randomize array values so that [10,9,8,0,0,0]
// becomes [9,0,10,0,8,0] instead
function shuffleArray(array) {
      
      for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
      }
      
      return array;
      
};

// What week are we in the date range?
let getCurWeek = function(curDay, days) {

    let weeks = ((days / 7) < 1) ? 1 : (days / 7);
    weeks = weeks.toFixed(0);
    
    let curWeek = ((curDay > 0) ? curDay / 7 : 0); 
    if ((curWeek % 1) != 0 && curWeek.toFixed(0) < weeks) curWeek++;
    return curWeek.toFixed(0);

};

/* ----------------------------------------------------------------------------------------------------------------
 UTILITIES
---------------------------------------------------------------------------------------------------------------- */ 

// Write results to log
let logDetails = function() {
	
      let log = this.mgr.create(this.tbl.log);
      log.set("name", this.rpt.logName);
      log.set("err", this.rpt.err);
      log.set("parameter_list", this.rpt.params);
      log.set("prog_created", this.rpt.totProgs);
      log.set("prog_inst_created", this.rpt.totProgInst);
      log.set("spkg_created", this.rpt.totSpkgs);
      log.set("soft_recs_created", this.rpt.totRecsSoftware);
      log.set("web_recs_created", this.rpt.totRecsWebApp);
      log.save();
	
};

/* ----------------------------------------------------------------------------------------------------------------
 STARTING POINT
---------------------------------------------------------------------------------------------------------------- */ 
try {
  
      run();
  
} catch (e) {
  
	this.rpt.err = e;
  
} finally {
      
      logDetails();
  
	let result = String.format("Software recs created: {0}, Web app recs created: {1}, already has usage: {2}, HW Util records: {3}, last error: {4}, update flag = {5}, debug={6}", 
		this.rpt.totRecsSoftware,
                this.rpt.totRecsWebApp,
                this.rpt.alreadyHasDailyUsage,
                this.rpt.totUtils,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};