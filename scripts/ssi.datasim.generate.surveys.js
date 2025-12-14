/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.generate.survey.feedback.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 1/29/2025
 @Notes: This script will iterate through existing surveys in acu_survey table and create X number of
 acu_survey_feedback records. It can also create the scopes for all avaialble groups if you have createScopes 
 set to true. It reads all Acumen groups and assigns them the existing surveys.
=============================================================================================================*/

const cfg = {
    createFeedback  : true,
    createScopes    : false, // !FOR NEW SURVEYS!, I would set this to TRUE one time run.
    surveyName      : null, // optional
    surveyId        : 6 // optional
};

// Satisfaction: 1-3, Yes/No: 1-2, then 1-5
const feedback = {
    min : 1000,
    max : 1000
};

const score = {
    min : 1,
    max : 5
};

const rpt = {
    err        : "n/a",
    created    : 0,
    exists     : 0,
    scopes     : 0
};

// Answered On date range
const startDate = new java.util.Date("4/21/2025");
const endDate = new java.util.Date("5/2/2025");

let run = function() {

    let q = Query.select(java.util.Arrays.asList(Query.column("s.id", "id"), Query.column("s.created_on", "created_on")));
    q.from("acu_survey", "s");
    if (cfg.surveyName) q.where(Criterion.EQ("name", cfg.surveyName));
    if (cfg.surveyId) q.where(Criterion.EQ("id", cfg.surveyId));
    let surveys = this.exec.executeLM(q);   
    let totalSurveys = surveys.length;
    if (totalSurveys == 0) throw "There are no surveys!";

    for (let i = 0; i < totalSurveys; i++) {

        let currentSurvey = surveys[i];
        let surveyId = currentSurvey["id"];
        let createdOn = currentSurvey["created_on"];
        let recCount = this.rand(feedback.min, feedback.max, 0);    
        
        let diff = this.getDateDiff(createdOn, startDate);
        if (diff < 0) throw "The current survey's created_on date, id:" + surveyId + ", is newer than the start date. Set created_on date to the past.";         
        
        let q = Query.select(java.util.Arrays.asList(Query.column("u.id", "user")));
        q.from("cmn_user", "u");
        q.join("cmn_person", "p", "p.id", "u.person");
        q.limit(recCount);
        let users = this.exec.executeL1(q);         

        // Loop through users with a Person
        for (let u = 0; u < users.length; u++) {

            if (jobHandle.isStopped()) throw "Cancelled..."; 

            let user = users[u];

            let crits = new java.util.ArrayList();
            crits.add(EQ("user", user));
            crits.add(EQ("survey", surveyId));

            // Make sure feedback doesn't already exist to avoid duplicates
            let feedbackCount = this.mgr.query("acu_survey_feedback").where(AND(crits)).count();
            if (feedbackCount == 0) {

                let feedback = this.mgr.create("acu_survey_feedback");
                feedback.set("survey", surveyId);
                feedback.set("user", user);
                feedback.set("score", biasedRandom(score.min, score.max, 0));
                feedback.set("answered_on", getAnsweredOn(startDate, endDate));
                feedback.set("location", getLocation(user));
                if (cfg.createFeedback) feedback.save();
                rpt.created++;

            } else {
                rpt.exists++;
            }

            let percentage = ((i / totalSurveys) * 100.0);
            jobState.onProgress(percentage, String.format("Processing user {0} for Survey {1}/{2}...",
                user, i, totalSurveys
            ));             
        }    
        
        /* -------------------------------------------------------------------------------
           If desired, create scope records using all available groups
           -----------------------------------------------------------------------------*/
        if (cfg.createScopes) {

            let q = Query.select(java.util.Arrays.asList(Query.column("g.id", "user")));
            q.from("acu_group", "g")
            let groups = this.exec.executeL1(q);
    
            for (let y = 0; y < groups.length; y++) {

                if (jobHandle.isStopped()) throw "Cancelled..."; 
                let group = groups[y];

                let crits = new java.util.ArrayList();
                crits.add(EQ("group", group));
                crits.add(EQ("survey", currentSurvey));

                // Make sure scope doesn't already exist to avoid duplicates
                let scopeCount = this.mgr.query("acu_survey_scope").where(AND(crits)).count();
                if (scopeCount == 0) {
                    let scope = this.mgr.create("acu_survey_scope");
                    scope.set("group", group);
                    scope.set("survey", currentSurvey);
                    scope.save()
                    rpt.scopes++;
                }
            }
        }
    }
};


/* -------------------------------------------------------------------------------
    Has a bias toward 1-2 on a 1-5 scale.
   -----------------------------------------------------------------------------*/
function biasedRandom(min, max) {

    let result = 1; // This will generate more 1's
    let type = max - min;
    const rnd = Math.random(); // Generates a number between 0 and 1    
    switch (type) {
        
        // One to Five Survey
        case 4 :

            if (rnd < 0.4) {
                result = 5; // 70% chance for 1
            } else if (rnd < 0.5) {
                result = 4;
            } else if (rnd < 0.6) {
                result = 3;
            } else if (rnd < 0.7) {
                result = 2;
            } else if (rnd < 0.8) {
                result = 1;
            }

            break;

        // Satisfaction Survey
        case 2 :

            if (rnd < 0.6) {
                result = 1;
            } else if (rnd < 0.8) {
                result = 2;
            } else if (rnd < 1.0) {
                result = 3;
            }

            break;  

        // Yes/No Survey
        case 1 :

            if (rnd < 0.7) {
                result = 1;
            } else {
                result = 2;
            }

            break;                        
    }
    
    return result;

};


/* -------------------------------------------------------------------------------
    See if the user already has a location in cmn_user. If he does not, we 
    need to add code for this.
   -----------------------------------------------------------------------------*/
let getLocation = function(user) {
  
    return getField("cmn_user", "location", "id", user);
};


/* -------------------------------------------------------------------------------
    Generate random dates for the answered_on field
   -----------------------------------------------------------------------------*/
let getAnsweredOn = function(startDate, endDate) {
    
    let days = this.getDateDiff(startDate, endDate); 
    let rand = this.rand(0, days, 0);
    let newDate = new java.util.Date(startDate);
    newDate.setDate(newDate.getDate() + rand);    
    
    return buildDate(newDate, 
        this.rand(0,18,0), 
            this.rand(0,59,0), 
                this.rand(0,59,0));
};


/* -------------------------------------------------------------------------------
    Set random hour, minutes and seconds and a date
   -----------------------------------------------------------------------------*/
let buildDate = function(curDate, hour, min, sec) {
      
    let Calendar = java.util.Calendar;
    let cal = Calendar.getInstance();
    cal.setTime(curDate);
    cal.set(Calendar.HOUR_OF_DAY, hour);
    cal.set(Calendar.MINUTE, min);
    cal.set(Calendar.SECOND, sec);     
    return cal.getTime();      
};


/* ----------------------------------------------------------------------------------------------------------------

 STARTING POINT

---------------------------------------------------------------------------------------------------------------- */ 
try {
  
    run();    
  
} catch (e) {
  
	rpt.err = e;
  
} finally {
  
	let result = String.format("Records created: {0}, Records exist: {1}, Scopes created: {2}, Create feedback = {3}, Create scopes = {4}, Last error: {5}.", 
		rpt.created,
        rpt.exists,
        rpt.scopes,
		cfg.createFeedback,
        cfg.createScopes,
		rpt.err);

	jobState.onProgress(100.0, result);			
};