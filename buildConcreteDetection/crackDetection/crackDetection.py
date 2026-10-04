import numpy as np
import cv2
import glob
import os, shutil
import logging,time

logging.basicConfig(filename="error.log", level=logging.INFO)


def identifyCrack(inputFolder,outputFolder, inputImage):
    try:
        # read a cracked sample image
        img = cv2.imread(inputFolder +'/'+ inputImage)
        logging.info(img)
        logging.info(cv2)
        # Convert into gray scale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Image processing ( smoothing )
        # Averaging
        blur = cv2.blur(gray,(3,3))

        # Apply logarithmic transform
        img_log = (np.log(blur+1)/(np.log(1+np.max(blur))))*255

        # Specify the data type
        img_log = np.array(img_log,dtype=np.uint8)

        # Image smoothing: bilateral filter
        bilateral = cv2.bilateralFilter(img_log, 5, 75, 75)

        # Canny Edge Detection
        edges = cv2.Canny(bilateral,100,200)

        # Morphological Closing Operator
        kernel = np.ones((5,5),np.uint8)
        closing = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        # Create feature detecting method
        # sift = cv2.xfeatures2d.SIFT_create()
        # surf = cv2.xfeatures2d.SURF_create()
        orb = cv2.ORB_create(nfeatures=1500)

        # Make featured Image
        keypoints, descriptors = orb.detectAndCompute(closing, None)
        featuredImg = cv2.drawKeypoints(closing, keypoints, None)

        # Create an output image
        f = inputImage.replace(".","-processed.")
        cv2.imwrite(outputFolder +'/'+ f, featuredImg)
        shutil.move(inputFolder+'/'+inputImage, outputFolder+'/'+inputImage)

        return f; 
    except Exception as e:
        logging.error(e)


# Define the input and output folder paths

inputFolder = 'uploads/images'
outputFolder = 'uploads/images/completed'
# Infinite loop to continuously monitor the input folder for new images
while 1:
    inputPathsData = []
    outputPathsData = []
    # Get all files in the input folder (ignoring subdirectories)
    files = [f for f in os.listdir('./'+inputFolder) if os.path.isfile(os.path.join('./'+inputFolder, f))]
    # Create output folder if it doesn't already exist
    if not os.path.isdir('uploads/images/completed'):
        os.mkdir('uploads/images/completed')

    # If no new files are found, wait for 2 seconds before checking again
    if not files:
        time.sleep(2)
    else:
        # Process each new image found in the input folder
        for imageName in files:
            optImg = identifyCrack(inputFolder,outputFolder,imageName)
            if optImg:
                # Keep track of input and output image paths for logging
                inputPathsData.append(outputFolder+'/'+imageName)
                outputPathsData.append(outputFolder+'/'+optImg)
        print(outputPathsData);
        logging.info(outputPathsData);












# import cv2
# import math
# import numpy as np
# import scipy.ndimage
# import os
# import glob

# def orientated_non_max_suppression(mag, ang):
#     """
#     Applies orientated non-maximal suppression to the gradient magnitude.
#     This suppresses pixels that are not local maxima along the gradient direction.
    
#     Args:
#         mag (np.array): Gradient magnitude image.
#         ang (np.array): Gradient angle image.
        
#     Returns:
#         np.array: The magnitude image after non-maximal suppression.
#     """
#     ang_quant = np.round(ang / (np.pi/4)) % 4
#     winE = np.array([[0, 0, 0], [1, 1, 1], [0, 0, 0]])
#     winSE = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]])
#     winS = np.array([[0, 1, 0], [0, 1, 0], [0, 1, 0]])
#     winSW = np.array([[0, 0, 1], [0, 1, 0], [1, 0, 0]])

#     magE = non_max_suppression(mag, winE)
#     magSE = non_max_suppression(mag, winSE)
#     magS = non_max_suppression(mag, winS)
#     magSW = non_max_suppression(mag, winSW)

#     mag[ang_quant == 0] = magE[ang_quant == 0]
#     mag[ang_quant == 1] = magSE[ang_quant == 1]
#     mag[ang_quant == 2] = magS[ang_quant == 2]
#     mag[ang_quant == 3] = magSW[ang_quant == 3]
#     return mag

# def non_max_suppression(data, win):
#     """
#     Performs non-maximal suppression on a 2D array.
    
#     Args:
#         data (np.array): Input image data.
#         win (np.array): The footprint (window) for the maximum filter.
        
#     Returns:
#         np.array: The data with non-maxima suppressed (set to 0).
#     """
#     data_max = scipy.ndimage.filters.maximum_filter(data, footprint=win, mode='constant')
#     data_max[data != data_max] = 0
#     return data_max

# def process_image(image_path, with_nmsup=True):
#     """
#     Processes a single image file to detect cracks and edges.
    
#     Args:
#         image_path (str): The full path to the image file.
#         with_nmsup (bool): Whether to apply non-maximal suppression.
        
#     Returns:
#         np.array: The processed image as a NumPy array.
#     """
#     print(f"Processing {os.path.basename(image_path)}...")
    
#     gray_image = cv2.imread(image_path, 0)
    
#     if gray_image is None:
#         print(f"Warning: Could not read image at {image_path}. Skipping.")
#         return None

#     fudgefactor = 1.3
#     sigma = 21
#     kernel_size = 2 * math.ceil(2 * sigma) + 1

#     gray_image = gray_image / 255.0
#     blur = cv2.GaussianBlur(gray_image, (kernel_size, kernel_size), sigma)
#     gray_image = cv2.subtract(gray_image, blur)

#     sobelx = cv2.Sobel(gray_image, cv2.CV_64F, 1, 0, ksize=3)
#     sobely = cv2.Sobel(gray_image, cv2.CV_64F, 0, 1, ksize=3)
#     mag = np.hypot(sobelx, sobely)
#     ang = np.arctan2(sobely, sobelx)

#     threshold = 4 * fudgefactor * np.mean(mag)
#     mag[mag < threshold] = 0

#     if with_nmsup:
#         mag = orientated_non_max_suppression(mag, ang)
#         mag[mag > 0] = 255
#         mag = mag.astype(np.uint8)
        
#     else:
#         mag = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX)

#     kernel = np.ones((5, 5), np.uint8)
#     result = cv2.morphologyEx(mag, cv2.MORPH_CLOSE, kernel)
    
#     return result

# def main():
#     """
#     Main function to handle batch processing of images.
#     """
#     input_folder = 'uploads/images/'
#     output_folder = 'uploads/images/completed/'

#     # Create the output directory if it doesn't exist
#     if not os.path.exists(output_folder):
#         print(f"Creating output directory: {output_folder}")
#         os.makedirs(output_folder)

#     # Get a list of all image files in the input folder
#     image_files = glob.glob(os.path.join(input_folder, '*.*'))

#     if not image_files:
#         print(f"No images found in the input folder: {input_folder}")
#         return

#     # Process each image in the folder
#     for image_path in image_files:
#         # Check if the file is an image by trying to read it with OpenCV
#         try:
#             # Process the image
#             processed_image = process_image(image_path)
            
#             if processed_image is not None:
#                 # Construct the output path
#                 filename = os.path.basename(image_path)
#                 output_path = os.path.join(output_folder, filename)
                
#                 # Save the processed image
#                 cv2.imwrite(output_path, processed_image)
#                 print(f"Saved processed image to {output_path}")

#         except Exception as e:
#             print(f"An error occurred while processing {image_path}: {e}")

# if __name__ == "__main__":
#     main()












# # import os
# # import cv2
# # from flask import Flask, request, render_template, send_from_directory

# # app = Flask(__name__)

# # # Folder structure
# # UPLOAD_FOLDER = "uploads/images"
# # COMPLETED_FOLDER = os.path.join(UPLOAD_FOLDER, "completed")

# # # Ensure directories exist
# # os.makedirs(UPLOAD_FOLDER, exist_ok=True)
# # os.makedirs(COMPLETED_FOLDER, exist_ok=True)


# # def process_image(image_path, filename):
# #     """Apply OpenCV crack detection and save processed image in COMPLETED folder"""
# #     img = cv2.imread(image_path)
# #     gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# #     # Apply Canny edge detection
# #     edges = cv2.Canny(gray, 100, 200)
# #     edges_colored = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

# #     # Overlay cracks on original image
# #     processed = cv2.addWeighted(img, 0.8, edges_colored, 1, 0)

# #     # Rename file -> crack_01.png → crack_01-processed.png
# #     name, ext = os.path.splitext(filename)
# #     new_filename = f"{name}-processed{ext}"
# #     new_path = os.path.join(COMPLETED_FOLDER, new_filename)

# #     cv2.imwrite(new_path, processed)
# #     return new_filename


# # @app.route("/", methods=["GET", "POST"])
# # def upload_file():
# #     if request.method == "POST":
# #         file = request.files["file"]
# #         if file:
# #             filepath = os.path.join(UPLOAD_FOLDER, file.filename)
# #             file.save(filepath)

# #             processed_filename = process_image(filepath, file.filename)

# #             return render_template(
# #                 "index.html",
# #                 filename=file.filename,
# #                 processed_filename=processed_filename,
# #             )
# #     return render_template("index.html")


# # @app.route("/uploads/<filename>")
# # def uploaded_file(filename):
# #     return send_from_directory(COMPLETED_FOLDER, filename)


# # if __name__ == "__main__":
# #     app.run(host="0.0.0.0", port=5051)
