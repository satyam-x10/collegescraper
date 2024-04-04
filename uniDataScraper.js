const crypto = require('crypto');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// Replace with the desired number of pages to be scraped (0-100)
const maxPageNumber = 0;

// Function to generate the URL for each page dynamically
function generateURL(pageNumber) {
  const urlElements = {
    domain: "www.topuniversities.com",
    path: [
      "university-rankings",
      "world-university-rankings",
      "2024"
    ],
    queryParams: {
      page: pageNumber, // Set the page number dynamically
    }
  };

  // Construct the URL using the 'urlElements' object
  const { domain, path, queryParams } = urlElements;
  const pathString = path.join('/');
  const queryParamsString = new URLSearchParams(queryParams);

  const generatedURL = `https://${domain}/${pathString}?${queryParamsString}`;
  //generated url will look like    https://www.topuniversities.com/university-rankings/world-university-rankings/2024?page=1

  return generatedURL;
}

// Function to generate unique IDs for each college
function generateUniqueId(collegename) {
  // College Name is hashed to generate unique identifier
  const id = crypto.createHash('sha256').update(collegename).digest('hex').substr(0, 16);
  return id;
}

// Function to remove integer and characters from the element
async function getTextContent(element) {
  const textContent = element.textContent;
  return textContent ? textContent : null;
}


// Main function to scrape the data and save it to a JSON file
(async () => {
  console.log('Scraping Data ... please wait ... :) ');
  const allData = [];
  const schemaData = {};
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // Expose functions to the page 
  await page.exposeFunction('generateUniqueId', generateUniqueId);
  await page.exposeFunction('getTextContent', getTextContent);

  // loop for all the pages
  for (let pgno = 0; pgno <= maxPageNumber; pgno++) {
    const url = generateURL(pgno);

    await page.goto(url);
    await page.waitForSelector('.uni-link');

    const pageData = await page.evaluate(async (schema) => {
      const colleges = [];
      const rows = document.querySelectorAll('.api-ranking-css.normal-row');


      // Function to traverse each Program to scrape Courses
      async function getPrograms(collegePageDoc) {
        const allPrograms = collegePageDoc.querySelectorAll('#aptabsContent.tab-content .tab-pane.fade[role="tabpanel"]');
        if (allPrograms.length === 0) {
          return;
        }
        const programs = [];

        for (const program of allPrograms) {
          const programId = program.getAttribute('id');
          const programName = programId.replace('tab', '');
          const currentProgram = { name: programName, courses: [] };

          const courseElements = program.querySelectorAll('.class-header');
          currentProgram.courses = await traverseCourses(courseElements);

          programs.push(currentProgram);
        }

        return programs;
      }

      //  Function to traverse each Course to scrape degrees
      async function traverseCourses(courseElements) {
        return Promise.all(Array.from(courseElements).map(async (courseElement) => {
          const courseNameMatch = await getTextContent(courseElement);
          const courseName = courseNameMatch ? courseNameMatch[1] : courseElement.textContent.trim();
          const cleanedCourseName = courseName.replace(/\n\(\d+\)/, '').trim();

          degrees = await scrapeDegrees(courseElement);

          const course = { name: cleanedCourseName, degrees: degrees };

          return course;
        }));
      }

      // Function to scrape degrees from each course
      function scrapeDegrees(courseElement) {
        const degreeElements = courseElement.nextElementSibling.querySelectorAll('.width-100.inside-tabs._gtmtrackDeptProgram_js');
        const degrees = [];

        degreeElements.forEach(degreeElement => {
          degrees.push(degreeElement.textContent.trim());
        });

        return degrees;
      }

      // Function to get schema for collegeKeys
     async function calculateSchema(schema, college) {

        const collegeKeys = Object.keys(college);
        const collegeKeysHash = await generateUniqueId(collegeKeys.join(''));

        // If the keys hash is different, update the schema

        if (collegeKeysHash !== schema.keysHash) {

          // check if all keys in schema are present in the college
          for (let key in schema.dataType) {
            if (!collegeKeys.includes(key) && !schema.optionalKeys.includes(key)) {
              schema.optionalKeys.push(key);
              schema.dataType[key] = `<Optional>${schema.dataType[key]}`;
            }
          }

          // check if any new key is present in the college
          collegeKeys.forEach(key => {

            dataType = typeof college[key];
            // check if data type is object , if yes  check if its array
            if (dataType == 'object') {
              Array.isArray(college[key]) ? dataType = 'Array' : dataType = 'Object';
            }

            if (schema.optionalKeys[key]) {
              return;
            }
            // handles first college by initialising fresh keys
            else if (schema.keysHash == '') {
              schema.dataType[key] = dataType;
            }
            // handles remaining college
            else if ((!schema.dataType[key])) {

                schema.dataType[key] = `<Optional>${dataType}`;
                schema.optionalKeys.push(key);

            }

          });

          // Update the keys hash in the schema
          schema.keysHash = collegeKeysHash;
        }

        return schema;
      }
      schema = { optionalKeys: [], keysHash: '', dataType: {} };
      // Scraping details of all colleges on current active page. each row equivalent to a college 
      await Promise.all(Array.from(rows).map(async (row, index) => {
        const college = {};
        
        let collegename = row.querySelector('.uni-link').textContent.trim();

        college.id = await generateUniqueId(collegename);
        college.name = collegename;
        college.score = row.querySelector('.overall-score-span').textContent.trim();
        fullAddress = row.querySelector('.location').textContent.trim();
        const [city, country] = fullAddress.split(',').map(part => part.trim());
        college.city = city;
        college.country = country;

        let collegeLink = row.querySelector('.uni-link').href;

        const collegePage = await fetch(collegeLink);
        const collegePageText = await collegePage.text();
        const collegePageDoc = new DOMParser().parseFromString(collegePageText, 'text/html');

        // Scrape the tuition fee

        const tuitionFeeElement = collegePageDoc.querySelector('div.single-badge[data-href="expenses_Tab"] h3');
        if (tuitionFeeElement) {
          college.tuitionFee = tuitionFeeElement.textContent.trim().replace('Tuition Fee/year', '');
        }

        //calling the function to Scrape Programs and Courses offered by the college
        const programsData = await getPrograms(collegePageDoc);
        if (programsData) {
          college.programs = programsData;          
        }
        colleges.push(college);

        // function to generate schema for keys of college
        schema = await calculateSchema(schema, college);

      }));


      return { colleges, schema };
    }, schemaData);

    allData.push(...pageData.colleges);

    // Updates schema with the latest information
    Object.assign(schemaData, pageData.schema);
  }

  await browser.close();

  // save schema file
  const schemaFileName = 'schema.json';
  delete schemaData.keysHash;
  const schemaJsonData = JSON.stringify(schemaData, null, 2);

  fs.writeFile(schemaFileName, schemaJsonData, (err) => {
    if (err) {
      console.error('Error writing schema to the file:', err);
    } else {
      console.log('Schema has been saved to', schemaFileName, 'successfully! :)');
    }
  });

  const fileName = 'university_data.json';
  const jsonData = JSON.stringify(allData, null, 2);

  fs.writeFile(fileName, jsonData, (err) => {
    if (err) {
      console.error('Error writing to the file:', err);
    } else {
      console.log('Colleges data has been saved to', fileName, 'successfully! :)');
    }
  });
  await exec('quicktype -o quickTypeSchema.json --lang schema university_data.json'); 
  console.log('quickTypeSchema.json has been generated successfully! :)');  
})();