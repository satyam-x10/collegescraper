# this script uses api to save images and logos of colleges and universities
import os
import json
import requests
import urllib
from urllib.error import URLError
from dotenv import load_dotenv
import csv

load_dotenv()
api_key = os.getenv("BING_API_KEY")

def convert_json_to_csv(json_file_path):
    try:
        with open(json_file_path, 'r') as f:
            data = json.load(f)

        csv_file_path = 'urls.csv'
        with open(csv_file_path, 'w', newline='') as csvfile:
            fieldnames = ['id', 'name', 'logo', 'images']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for item in data:
                writer.writerow(item)

        print('CSV file successfully generated.')
    except Exception as e:
        print('Error converting JSON to CSV:', e)

def search_bing(query, count=1):
    license_type="ShareCommercially"
    base_url = "https://api.bing.microsoft.com/v7.0/images/search"
    headers = {"Ocp-Apim-Subscription-Key": api_key}
    # params = {"q": query, "count": count}
    # params = {"q": query, "count": count, "license": license_type}
    # params = {"q": query, "count": count, "license": license_type,"imageFilters": "Size:small"}
    params = {"q": query, "count": count, "license": license_type,"imageFilters": "Size:Medium+Size:Large"}

    response = requests.get(base_url, params=params, headers=headers)
    response.raise_for_status()  
    return response.json()
    
def save_image(url, filename):
    try:
        urllib.request.urlretrieve(url, filename)
    except URLError as e:
        print(f"Error downloading {filename}")
        
def get_logos(college):
    college_name = college['name']
    college_id = college['id']
    search_query = f"logo of {college_name} college"
    logo_results = search_bing(search_query, 10)['value']
    logo_urls = []
    for i, result in enumerate(logo_results, 1):
        logo_url = result['contentUrl']
        logo_filename = f"./img/{college_id}/logos/logo_{i}.jpg"
        os.makedirs(os.path.dirname(logo_filename), exist_ok=True)
        try:
            save_image(logo_url, logo_filename)
            logo_urls.append(logo_url)
        except Exception as logo_error:
            print(f"Failed to save logo image for {college_name}: {logo_error}")
    return logo_urls

def get_images(college):
    college_name = college['name']
    college_id = college['id']
    search_query = f"{college_name} college"
    image_results = search_bing(search_query, 30)['value']
    images = []
    for i, image_result in enumerate(image_results, 1):
        image_url = image_result['contentUrl']
        image_filename = f"./img/{college_id}/images/{college_name}_{i}.jpg"
        os.makedirs(os.path.dirname(image_filename), exist_ok=True)
        try:
            save_image(image_url, image_filename)
            images.append(image_url)
        except Exception as image_error:
            print(f"Failed to save image {i} for {college_name}: {image_error}")
    return images

def get_logos_and_images(college):
    college_name = college['name']
    college_id = college['id']    
    logos = get_logos(college)
    images = get_images(college)
    return {
        'id': college_id,
        'name': college_name,
        'logo': logos,
        'images': images
    }

def import_university_data(data_file_path):
    urls_data = []
    try:
        with open(data_file_path, 'r') as f:
            colleges = json.load(f)

        for index, college in enumerate(colleges, 1):
            college_data = get_logos_and_images(college)
            urls_data.append(college_data)
            print(f"Processing college number {index} of {len(colleges)}")

    except Exception as e:
        print("Error scraping data:", e)

    with open('./urls.json', 'w') as f:
        json.dump(urls_data, f, indent=2)

    print("JSON data saved to urls.json")

    convert_json_to_csv('./urls.json')

if __name__ == "__main__":
    data_file_path = 'university_data.json'
    if not api_key:
        print("BING_API_KEY environment variable is not set.")
    else:
        print("Wait UniBuzzerss we are scraping images and logos for you...")
        import_university_data(data_file_path)
