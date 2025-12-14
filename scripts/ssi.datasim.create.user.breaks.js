include("ssi.utils.js");

// 3/11, 3/18, 3/25 - Mon
// 3/12, 19, 26 - Tues
// 3/13, 20, 27 - Wed
// 3/14, 21, 28 - Thurs
// 3/15, 22, 29 - Fri

/* 
    Example for Mon - Friday might be:
    
    hourOfInterest = 8, 3/4/2024 (Mon)
    ...
    hourOfInterest = 18, 3/4/2024 (Mon)
    
    hourOfInterest = 8, 3/5/2024 (Tues)
    ...
    hourOfInterest = 18, 3/5/2024 (Tues)   
    ... 
    ...
    ...
    hourOfInterest = 18, 3/8/2024 (Fri)    
*/

let getCalDate = function(dt, hour, min) {
    
    let Calendar = java.util.Calendar;
    let cal = Calendar.getInstance();
    cal.setTime(dt);
    cal.set(Calendar.HOUR_OF_DAY, hour);
    cal.set(Calendar.MINUTE, min);        
    return cal.getTime();    
};



// ---------------- START -----------------------------------------------------------------------------

let hourOfInterest = 11;
let startHour = hourOfInterest + 1;
let limit = 999999;
let sd = "4/1/2025";
let ed = "5/9/2025";
let scatter = 99; // Percent to skip

let update = true;
let breakCandidate = 0;

// Day's timeframe to search for hourly data
let d1 = getCalDate(new java.util.Date(sd), startHour, 0);
let d2 = getCalDate(new java.util.Date(ed), 23, 59);

let q = this.mgr.query("cmdb_program_hourly_usage");
    q.where(Criterion.BETWEEN("start_time", d1, d2));
    q.orderBy("start_time", 'ASC');

let recs = q.executeLazily();
let breaksCreated = 0;
let curRecs = 0;

// Loop through all hourly data in timeframe
while (recs.hasNext() && breaksCreated != limit) {   

    if (jobHandle.isStopped()) throw "Script job was cancelled...";		

    let rnd = this.rand(1, 100, 0);
    if (rnd < scatter) continue;

    let rec = recs.next();
    
    let startTime = rec.get("start_time");
    let du = rec.get("daily_usage");
    let daily = mgr.readEntity("cmdb_program_daily_usage", Criterion.EQ("id", du));
    let user = daily.get("user");
    let computer = daily.get("used_from");
    let usageDate = daily.get("usage_date");
    
    // -------------------------------------------------------------------------------------------------
    // Does this machine/user combo have usage in thes hourly table but NOT in hour of interest? Plus,
    // Does the user have a user logon record? If so, then candidate for a break.
    // -------------------------------------------------------------------------------------------------
   
    let crits = new java.util.ArrayList();
    crits.add(Criterion.EQ("usage_hour", hourOfInterest));
    crits.add(Criterion.EQ("daily_usage", daily.get("id")));

    let hourlies = mgr.query("cmdb_program_hourly_usage").where(Criterion.AND(crits)).count();
   
    if (hourlies == 0) {
        
        let crits2 = new java.util.ArrayList();
        crits2.add(Criterion.EQ("usage_date", usageDate));
        crits2.add(Criterion.EQ("user", user));
        crits2.add(Criterion.EQ("used_from", computer));

        // Does the user have user logon records?
        let logons = mgr.query("cmdb_user_logon").where(Criterion.AND(crits2)).count();
        if (logons == 0) 
            continue;
        else
            breakCandidate++;

        // Does the user already have a break in this day and hour?
        let crits3 = new java.util.ArrayList();
        let d1 = buildDate(usageDate, hourOfInterest, 0, 0);
        let d2 = buildDate(usageDate, hourOfInterest, 59, 59);   
        crits3.add(Criterion.BETWEEN("start_time", d1, d2));
        crits3.add(Criterion.EQ("user", user));
        crits3.add(Criterion.EQ("computer", computer));        

        let breaks = mgr.query("cmdb_user_break_time").where(Criterion.AND(crits3)).count();
        if (breaks > 0) continue;

        // Create the break;
        let newRec = this.mgr.create("cmdb_user_break_time");
        newRec.set("computer", computer);
        newRec.set("user", user);
        newRec.set("start_time", getCalDate(new java.util.Date(startTime), hourOfInterest, this.rand(0,10,0)));
        newRec.set("end_time", getCalDate(new java.util.Date(startTime), hourOfInterest, this.rand(30,59,0)));
        if (update) newRec.save();
        breaksCreated++;
    }

    curRecs++;
    jobState.onProgress(100.0, "Current rec for day " + usageDate + ", curRecs: " + curRecs + ", Breaks: " + breaksCreated);	
}

jobState.onProgress(100.0, "Total recs processed: " + curRecs + ", Break Candidates: " + breakCandidate + ", Breaks created: " + breaksCreated);